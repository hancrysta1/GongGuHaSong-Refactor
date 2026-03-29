# 결제 시스템 트러블슈팅 — SAGA 보상 트랜잭션 + 동시성 제어

## 1. 문제 상황

공구하송의 결제 흐름은 여러 서비스가 순차적으로 관여한다.

```
사용자 → 장바구니 → 결제
  │
  STEP 1: HMAC 서명 검증 (위변조 방지)
  STEP 2: 결제 수단 처리
          ├─ POINT → point-service에서 잔액 조회 → 부족하면 실패 → 충분하면 차감
          ├─ CARD → cardService에서 한도 조회 → 부족하면 실패 → 충분하면 결제
          └─ CARD_AND_POINT → 포인트 먼저 차감 → 나머지 카드 결제
  STEP 3: 결제 기록 저장 (MySQL)
  │
  실패 시 역순 보상:
    카드 환불 → 포인트 복구 → 재고 복구 → 적립 포인트 회수
```

k6 부하 테스트 스크립트에서 "결제 요청 전 포인트 잔액 조회 → 결제 요청 → 결제 후 포인트 잔액 조회"를 자동으로 수행하고, 결제가 실패(HTTP 200 아님)했는데 잔액이 줄어든 건을 `rollback_missing` 메트릭으로 집계했다. 동시 300명으로 22,000건을 돌린 결과, 결제는 실패했는데 포인트가 차감된 채 복구되지 않는 케이스가 2,380건 발견됐다.

---

## 2. 원인 분석 — 왜 이런 일이 생기는가

### 단일 DB에서는 `@Transactional`로 해결되는 문제

모놀리식 아키텍처에서는 하나의 DB에 모든 데이터가 있다. `@Transactional`은 하나의 DB 커넥션 안에서 여러 SQL을 묶어서, 하나라도 실패하면 전부 롤백해주는 Spring 어노테이션이다. DB의 트랜잭션 기능(begin/commit/rollback)을 자동으로 처리해준다.

하지만 `@Transactional`은 로컬 트랜잭션이다. 같은 DB에 연결된 SQL만 묶을 수 있고, 다른 서비스의 다른 DB에서 일어나는 연산은 묶을 수 없다.

```java
// 모놀리식 — 문제 없음
@Transactional
public void pay(String userId, int amount) {
    pointRepository.deduct(userId, amount);   // 같은 DB
    paymentRepository.save(payment);           // 같은 DB
    // 둘 중 하나 실패하면 → 전부 롤백 (DB가 알아서 처리)
}
```

하지만 마이크로서비스에서는 DB가 서비스마다 다르다.

```
payment-service → payment_db (MySQL)
point-service   → point_db (MySQL)
```

서로 다른 DB이기 때문에 `@Transactional`이 아무 의미가 없다. Spring의 트랜잭션 매니저는 하나의 데이터소스만 관리하니까, 다른 서비스의 DB 변경을 롤백할 방법이 없다.

### 근본 원인: 분산 시스템에서의 부분 실패(Partial Failure)

Chris Richardson의 *"Microservices Patterns"*에서는 이를 "분산 트랜잭션의 원자성 보장 불가" 문제로 설명한다.

> "In a microservice architecture, transactions that span multiple services must use a mechanism like the Saga pattern because traditional distributed transactions (2PC) don't scale and aren't supported by many modern technologies."

기존 해결책인 2PC(Two-Phase Commit)도 있지만.
- 성능 병목 (모든 참여자가 락을 잡고 대기)
- 코디네이터 단일 장애점
- MongoDB, Kafka 등 NoSQL/메시징은 2PC 미지원

그래서 대안으로 나온 게 SAGA 패턴이다.

### 우리 코드에서의 실제 문제

```java
// PaymentService.createPayment() — SAGA 적용 전
pointRestClient.usePoints(userId, pointUsed, ...);  // ① point-service REST 호출 → 포인트 차감 커밋됨
// ↑ 이 시점에서 point-db에는 이미 반영됨

paymentRepository.save(payment);  // ② payment-db에 저장
// ↑ 여기서 실패하면? → ①은 이미 커밋됨 → 롤백 불가
```

①과 ②가 서로 다른 DB에 있기 때문에, ①이 성공하고 ②가 실패하면 불일치가 발생한다.

이게 모놀리식에서는 절대 안 생기는, 마이크로서비스 고유의 문제다.

---

## 3. 처음 든 생각 — "그냥 try-catch로 되지 않나?"

솔직히 처음에는 이렇게 생각했다.

> "포인트 차감하고, 뒤에서 실패하면 catch에서 포인트 돌려주면 되는 거 아냐?"

그런데 생각해보니.
- catch에서 포인트 복구 REST 호출이 또 실패하면?
- 서버가 crash나서 catch 블록 자체에 도달 못 하면?
- 동시에 여러 요청이 같은 유저의 포인트를 건드리면?

단순 try-catch는 "보상 트랜잭션"의 가장 기초적인 형태이긴 하지만, 실제 운영에서는 부족하다. 그래도 일단 여기서부터 시작해보기로 했다.

---

## 4. 정량화 — 실제로 얼마나 문제인지 측정

말로만 "문제될 수 있다"로는 부족하다. 실제로 얼마나 누락되는지 수치를 뽑았다.

두 가지를 각각 별도 테스트로 검증했다:

| | 테스트 1: 동시성 검증 | 테스트 2: SAGA 보상 검증 |
|---|---|---|
| 스크립트 | `payment-concurrency-test.js` | `saga-detail-test.js` |
| 목적 | 동시 결제 시 이중 차감 / 마이너스 잔액 발생하는지 | 결제 실패 시 포인트가 정확히 복구되는지 |
| 동시 사용자 | 50 → 200 → 500 → 1000명 + 스파이크 500명 | 50 → 100 → 200 → 300명 |
| 장애 주입 | 없음 (정상 환경) | 10% 확률 크래시 + 3초 타임아웃 |
| 검증 항목 | `point_inconsistency`, `overdraft_detected` | `rollback_missing` |

---

### 테스트 1: 동시성 검증 (`payment-concurrency-test.js`)

장애 주입 없이, 순수하게 동시 사용자를 최대 1000명까지 올린다.

```
0:00~0:30  — 0 → 50명 (워밍업)
0:30~1:30  — 50 → 200명
1:30~2:30  — 200 → 500명
2:30~3:30  — 500 → 1000명
3:30~4:00  — 1000 → 0명 (정리)
4:30~5:00  — 500명 스파이크 (인기 공구 오픈 시뮬레이션)
```

검증 항목:
- `point_inconsistency` — 결제 성공인데 포인트가 정확히 차감 안 됨 (이중 차감 or 차감 누락)
- `overdraft_detected` — 잔액이 마이너스가 됨 (잔액 검증 우회)

이 테스트에서 두 항목 모두 0건이면, `SELECT FOR UPDATE`가 동시 1000명 환경에서도 정상 동작한다는 의미.

---

### 테스트 2: SAGA 보상 검증 (`saga-detail-test.js`)

동시성은 300명으로 고정하고, **의도적으로 장애를 주입**해서 SAGA 보상이 되는지 확인한다.

#### 장애 주입 코드

포인트 차감 후, DB 저장 전에 10% 확률로 예외를 발생시킨다. 실제 운영에서 네트워크 파티션이나 OOM kill로 서비스가 중간에 죽는 것을 시뮬레이션.

```java
// PaymentService.createPayment() 에 삽입
pointRestClient.usePoints(userId, pointUsed, ...);  // ✅ 포인트 차감 완료

// 장애 주입: 10% 확률로 크래시
if (pointUsed > 0 && Math.random() < 0.1) {
    throw new RuntimeException("서비스 장애 시뮬레이션");
}

paymentRepository.save(payment);  // ← 여기 도달 못 함 → 포인트만 날아감
```

#### 왜 장애를 주입하는가?

처음에는 부하 없이 단건으로 테스트했는데, localhost에서는 모든 호출이 5ms 내에 끝나서 부분 실패가 거의 발생하지 않았다. 실제 운영 환경(서로 다른 서버, 네트워크 홉, AZ 간 통신)에서는 지연과 타임아웃이 빈번하지만, 로컬에서는 재현이 어렵다.

그래서 Chaos Engineering 기법으로 인위적으로 장애를 주입해서 문제를 가시화했다.

#### 테스트 시나리오

```
0:00~1:00  — 50명 동시 결제 (장애 주입 10%, 타임아웃 3초)
1:30~2:30  — 100명
3:00~4:00  — 200명
4:30~5:30  — 300명
```

총 건수(약 22,998건)는 목표치가 아니라, 위 시나리오를 실행했을 때 처리된 결과값이다. 단계적으로 올린 이유는 50명에서 정상이어도 300명에서 문제가 발생할 수 있기 때문이다.

#### k6 검증 로직 (핵심)

```javascript
// load-test/saga-detail-test.js

// 결제 전 포인트 잔액 스냅샷
const beforeRes = http.get(`${POINT_URL}/point/${userId}`);
let pointsBefore = JSON.parse(beforeRes.body).availablePoints;

// 결제 요청 (포인트 결제, 3초 타임아웃)
const payRes = http.post(`${PAYMENT_URL}/payment`, JSON.stringify({
    orderId: `test-${__VU}-${__ITER}`,
    userId: userId,
    title: '테스트 공구상품',
    quantity: 1,
    unitPrice: 100,
    pointUsed: 100,
    paymentMethod: 'POINT',
}), { headers, timeout: '3s' });

const success = payRes.status === 200;

// 결제 후 포인트 잔액 확인 → 정합성 검증
const afterRes = http.get(`${POINT_URL}/point/${userId}`);
const pointsAfter = JSON.parse(afterRes.body).availablePoints;

if (!success && pointsAfter < pointsBefore) {
    // ★ 결제 실패인데 포인트가 차감되어 있음 = 롤백 누락!
    rollbackMissing.add(1);
}
```

#### 이 테스트가 실제 운영 장애를 재현하는 방법

| 시간 | 실제 운영에서 일어나는 일 | 이 테스트에서 재현하는 방법 |
|---|---|---|
| 0:00~1:00 | 공구 오픈 직후, 초기 유입 | 50명 — SAGA 보상 기본 동작 확인 |
| 1:30~2:30 | SNS 공유로 트래픽 증가 | 100명 — 동시 요청이 늘면서 응답 지연 발생 |
| 3:00~4:00 | 마감 임박 알림으로 접속 폭증 | 200명 — 여러 요청이 같은 DB 행을 동시에 잡으려고 대기, 타임아웃 증가 |
| 4:30~5:30 | 피크 트래픽 | 300명 — 최대 동시성에서 장애 + 이중 차감 발생 여부 검증 |

- **3초 타임아웃** — 실제 운영에서 서버 간 네트워크가 느려지거나 끊기는 상황 재현
- **10% 장애 주입** — 포인트는 차감됐는데 결제 기록 저장 전에 서비스가 죽는 상황 재현

핵심은 **"장애가 일어나는 최악의 타이밍"을 의도적으로 만든 것**이다. 포인트 차감은 성공했는데 결제 기록 저장 전에 서비스가 죽는 순간 — 이 타이밍이 실제 운영에서 돈이 사라지는 원인이고, 이 테스트는 정확히 그 구간을 10% 확률로 재현한다.

---

## 5. SAGA 적용 전 결과 (Before)

```
█ THRESHOLDS

  rollback_missing
  ✗ 'count<1' count=2380        ← 포인트 유실 2,380건

█ TOTAL RESULTS

  결제 시도:        22,998건
  결제 성공:        20,618건 (89.65%)
  결제 실패:         2,380건 (10.35%) ← 장애 주입 10%와 일치
  rollback_missing:  2,380건         ← 실패한 건 100%가 포인트 유실
  success_rate:      89.65%
```

결제가 실패한 2,380건 전부에서 포인트가 차감된 채 복구되지 않았다.

실패한 건의 100%가 포인트 유실 — 현재 코드에 보상 트랜잭션이 전혀 없기 때문.

일 10만 건 결제 기준으로 환산하면, 10% 장애율에서 매일 약 10,000건의 포인트 유실이 발생한다. 장애율이 1%라 해도 매일 1,000건. 결제 도메인에서 이건 허용 불가능한 수치다.

---

## 6. SAGA 패턴 적용 — Orchestration 방식

### 왜 Orchestration인가?

SAGA 패턴에는 두 가지 방식이 있다.

| | Choreography | Orchestration |
|---|---|---|
| 구조 | 이벤트 기반, 각 서비스가 다음 단계 트리거 | 중앙 오케스트레이터가 순서 제어 |
| 장점 | 느슨한 결합 | 흐름 파악 용이, 보상 로직 집중 |
| 단점 | 흐름 추적 어려움 | 오케스트레이터가 단일 장애점 |
| 적합 | 서비스 수 많고 복잡한 이벤트 체인 | 2-3단계 명확한 순서 |

우리 결제 흐름은 `포인트 차감 → 카드 결제 → DB 저장`으로 단계가 명확하고 순서가 고정이라 Orchestration이 적합하다. payment-service가 오케스트레이터 역할을 하면서, 각 단계의 성공/실패에 따라 보상 트랜잭션을 실행한다.

### 구현 코드

```java
public Payment createPayment(...) {
    boolean pointDeducted = false;
    boolean cardCharged = false;

    try {
        // ── STEP 1: 포인트 차감 ──
        if (pointUsed > 0) {
            pointRestClient.usePoints(userId, pointUsed, title + " 결제");
            pointDeducted = true;
        }

        // ── STEP 2: 카드 결제 ──
        if ("CARD".equals(paymentMethod) || "CARD_AND_POINT".equals(paymentMethod)) {
            cardService.processCardPayment(cardId, cardAmount);
            cardCharged = true;
        }

        // ── STEP 3: 결제 기록 저장 ──
        Payment payment = new Payment();
        // ... 필드 설정
        return paymentRepository.save(payment);

    } catch (Exception e) {
        // ── SAGA 보상 트랜잭션 ──
        // 역순으로 이전 단계를 롤백

        // 카드 결제 롤백
        if (cardCharged) {
            try {
                cardService.refundCardPayment(cardId, cardAmount);
            } catch (Exception refundEx) {
                log.error("[SAGA] 카드 환불 실패: {}", refundEx.getMessage());
            }
        }

        // 포인트 롤백
        if (pointDeducted) {
            try {
                pointRestClient.cancelPoints(userId, pointUsed, title + " 결제 실패 복구");
            } catch (Exception cancelEx) {
                log.error("[SAGA] 포인트 복구 실패: {}", cancelEx.getMessage());
            }
        }

        // 적립 포인트 회수 (Kafka로 이미 적립된 수량 × 100P)
        int earnedPoints = quantity * 100;
        try {
            pointRestClient.usePoints(userId, earnedPoints, title + " 결제 실패 적립 회수");
        } catch (Exception revokeEx) {
            // 비동기 적립이라 아직 안 들어왔을 수 있음 → Outbox로 재시도
            compensationService.saveFailedCompensation(orderId, userId,
                "POINT_EARN_REVOKE", earnedPoints, null, revokeEx.getMessage());
        }

        throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
            "결제 중 오류 발생. 차감된 금액은 자동 복구된다.");
    }
}
```

### 핵심 포인트

1. `boolean pointDeducted` 플래그: 각 단계의 성공 여부를 추적해서, 실패 시 어디까지 롤백해야 하는지 판단
2. 역순 롤백: 카드 → 포인트 → 재고 → 적립 회수 순서로 보상
3. 보상 실패도 처리: 각 보상이 실패하면 CompensationOutbox에 저장 → 30초 폴링 재시도
4. 적립 회수의 특수성: Kafka 비동기 적립이라 보상 시점에 아직 적립이 안 됐을 수 있음 → Outbox 재시도로 최종 회수 보장

### SAGA 보상과 Kafka 비동기 적립의 타이밍 충돌

결제 실패 시 SAGA 보상(동기)과 Kafka 포인트 적립(비동기)이 동시에 일어날 수 있다. 이때 실행 순서에 따라 결과가 달라지는가?

**시나리오**: 14,700P 보유, 전액 포인트 결제, 주문 수량 1개 (적립 100P)

```
[정상 순서]
t1: 포인트 14,700P 차감 → 잔액 0P
t2: SAGA 보상: 14,700P 복구 → 잔액 14,700P
t3: Kafka 적립 100P 도착 → 잔액 14,800P
t4: SAGA 보상: 적립 100P 회수 → 잔액 14,700P ✅

[Kafka가 먼저 도착]
t1: 포인트 14,700P 차감 → 잔액 0P
t2: Kafka 적립 100P 도착 → 잔액 100P
t3: SAGA 보상: 14,700P 복구 → 잔액 14,800P
t4: SAGA 보상: 적립 100P 회수 → 잔액 14,700P ✅

[적립이 아직 안 들어옴]
t1: 포인트 14,700P 차감 → 잔액 0P
t2: SAGA 보상: 14,700P 복구 → 잔액 14,700P
t3: SAGA 보상: 적립 100P 회수 시도 → 잔액 부족(적립 아직 안 옴) → 실패
t4: CompensationOutbox에 POINT_EARN_REVOKE 저장
t5: Kafka 적립 100P 도착 → 잔액 14,800P
t6: Outbox 스케줄러 재시도: 100P 회수 → 잔액 14,700P ✅
```

세 가지 시나리오 모두 최종 잔액은 14,700P로 수렴한다.

**왜 순서를 강제하지 않는가?**

순서를 보장하려면 "Kafka 적립이 들어올 때까지 대기"하는 로직이 필요한데, Kafka 컨슈머가 언제 처리할지는 보장할 수 없다 (1초 후일 수도, 컨슈머가 밀려서 30초 후일 수도 있다). 동기 보상 흐름에서 비동기 이벤트를 기다리는 건 SAGA의 즉시 응답 원칙에 어긋난다.

대신 **최종 일관성(Eventual Consistency)** 전략을 쓴다:
- `SELECT FOR UPDATE`가 마이너스 잔액을 원천 차단 (잔액 부족이면 예외, 차감 거부)
- 회수 실패 시 CompensationOutbox에 저장 → 30초 폴링 재시도 (최대 5회)
- Kafka 적립이 들어온 후 재시도하면 회수 성공

이게 분산 환경에서 SAGA가 동작하는 방식이다. 모든 단계가 동시에 완벽히 맞아떨어지는 건 불가능하고, **최종적으로 맞아떨어지는 것을 보장**한다.

---

## 7. SAGA 적용 후 결과 (After)

동일한 장애 주입(10%), 동일한 부하 조건에서 재측정.

```
█ THRESHOLDS

  rollback_missing
  ✗ 'count<1' count=18          ← 2,380 → 18로 감소

█ TOTAL RESULTS

  결제 시도:        22,737건
  결제 성공:        20,468건 (90.02%)
  결제 실패:         2,269건
  rollback_missing:     18건         ← 실패 건 중 0.79%만 유실
  success_rate:      90.02%
```

### Before vs After 비교

| 지표 | Before (SAGA 없음) | After (SAGA 적용) | 개선율 |
|------|-------------------|-------------------|--------|
| 결제 실패 건수 | 2,380건 | 2,269건 | - |
| 포인트 유실 건수 | 2,380건 | 18건 | 99.2% 감소 |
| 포인트 유실률 (전체 대비) | 10.35% | 0.08% | -10.27%p |
| 실패 건 중 유실 비율 | 100% | 0.79% | -99.21%p |

### 남은 18건 — 그런데 왜 아직 남아있지?

SAGA를 적용했는데도 18건이 남았다. 처음에는 "보상 REST 호출이 타임아웃 난 건가?" 생각했다. 하지만 로그를 확인해보니 보상 트랜잭션은 정상 호출되었는데, 포인트가 복구되지 않은 케이스가 있었다.

여기서 의문이 생겼다. 보상 트랜잭션이 호출됐는데 왜 복구가 안 되지?

이건 SAGA 문제가 아니라, point-service 내부의 동시성 문제였다.

---

## 8. 두 번째 문제 — 동시성 (Race Condition)

### 의심의 시작

SAGA 테스트에서 동시 300명이 같은 시점에 결제를 쏟아붓는 상황이었다. 이때 같은 유저에 대해 포인트 차감 요청이 거의 동시에 들어올 수 있다. 장바구니에 3개 상품을 담고 결제하면, 한 유저에게 3건의 포인트 차감이 연속으로 발생한다.

> "동시에 같은 유저의 포인트를 읽고, 동시에 차감하면... 어떻게 되지?"

이게 분산 트랜잭션(SAGA)과는 완전히 다른 차원의 문제였다.

### 동시 접속 시 반드시 확인해야 하는 것들

결제 시스템에서 동시성을 고려할 때, 다음 항목을 전부 검증해야 한다.

1. Lost Update (갱신 손실): 두 요청이 같은 값을 읽고 각자 수정 → 하나가 덮어씀
2. Overdraft (마이너스 잔액): 잔액 검증을 통과한 두 요청이 동시에 차감 → 잔액 음수
3. Double Deduction (이중 차감): 한 번만 빠져야 하는데 두 번 빠짐
4. Phantom Read: 검증 시점과 차감 시점 사이에 다른 트랜잭션이 끼어듦
5. 멱등성 미보장: 같은 결제 요청이 재시도로 중복 실행 → 이중 결제

이 중 하나라도 뚫리면, 사용자 입장에서는 "돈이 사라졌다" 또는 "공짜로 결제됐다"가 된다.

### 실제로 동시성을 고려하지 않으면 어떻게 되는가

동시성 문제는 "여러 사람이 하나의 자원을 공유"할 때 대표적으로 발생한다. 공동구매에서 가장 명확한 예시는 재고다.

시나리오 1: Lost Update (재고)
```
인기 공구 상품, 재고 3개 남음. 5명이 동시에 결제 버튼을 누름.

시간  유저A              유저B              유저C
 t1   읽기: 재고 3개
 t2                      읽기: 재고 3개
 t3                                         읽기: 재고 3개
 t4   검증: 3≥1 OK
 t5   저장: 재고 2개
 t6                      검증: 3≥1 OK       ← 이미 2개인데 3으로 읽음
 t7                      저장: 재고 2개      ← A의 차감을 덮어씀!
 t8                                         저장: 재고 2개

결과: 3명이 구매했는데 재고가 2개로만 줄어듦
     → 실제로는 0개여야 하는데 2개 남은 것처럼 보임
```

시나리오 2: Overdraft (포인트 — 한 유저의 동시 요청)
```
포인트도 마찬가지다. 한 유저가 장바구니에 3개를 담고 결제하면
3건의 포인트 차감이 거의 동시에 서버에 도착한다.

유저 잔액: 100P, 3건이 각각 100P 차감 시도

시간  결제 요청 1          결제 요청 2          결제 요청 3
 t1   읽기: 100P           읽기: 100P           읽기: 100P
 t2   검증: 100≥100 OK     검증: 100≥100 OK     검증: 100≥100 OK
 t3   저장: 0P             저장: 0P              저장: 0P

결과: 100P만 있는데 300P 차감됨
     → 있지도 않은 돈으로 결제 성공
```

실제로 여러 커머스에서 "한정 수량 상품이 재고 이상으로 팔린" 사건이나 "쿠폰이 수만 장 복사된" 사건이 이 동시성 미처리에서 비롯된 것이다.

### 문제의 코드 — Read-Check-Write 패턴

```java
// PointService.usePoints() — 기존 코드
Point point = getPoint(userId);                           // ① 읽기
if (point.getAvailablePoints() < amount) { throw ... }    // ② 검증
point.setAvailablePoints(point.getAvailablePoints() - amount);  // ③ 메모리 차감
pointRepository.save(point);                               // ④ DB 저장
```

①~④는 4개의 독립적인 연산이다. Java 코드로는 한 블록 안에 있어서 원자적으로 보이지만, 실제로는.
- ①에서 DB 조회 (네트워크 I/O)
- ④에서 DB 저장 (네트워크 I/O)
- 그 사이에 다른 스레드/요청이 같은 document를 수정할 수 있음

### 1차 시도: MongoDB findAndModify

당시 point-service는 MongoDB를 쓰고 있었다. MongoDB에는 `SELECT FOR UPDATE`가 없어서, `findAndModify`라는 원자적 연산으로 조건 검증 + 차감을 한 번에 처리했다. 동시성 테스트(500P에 10건 동시)에서 마이너스 잔액 없이 정확히 5건만 성공하는 것을 확인했다.

하지만 한계가 있었다. 포인트 차감(`findAndModify`)과 이력 저장(`save`)이 별도 연산이라, 차감은 됐는데 이력이 누락될 가능성이 구조적으로 남아있었다.

### 2차: MySQL 전환

MongoDB는 애초에 이런 용도로 만들어진 DB가 아니었다. 대규모 비정형 데이터와 유연한 스키마에 강점이 있는 DB이고, 매 연산마다 트랜잭션이 필수인 금전 도메인과는 맞지 않았다. 그래서 point-service와 payment-service를 MySQL로 마이그레이션했다.

```java
// 최종 — MySQL @Transactional + SELECT FOR UPDATE
@Transactional
public Point usePoints(String userId, int amount, String description) {
    Point point = pointRepository.findByUserIdForUpdate(userId)  // 행 잠금
        .orElseThrow(...);
    if (point.getAvailablePoints() < amount) throw ...;
    point.setAvailablePoints(point.getAvailablePoints() - amount);
    pointHistoryRepository.save(history);  // 같은 트랜잭션 — 실패 시 전부 롤백
}
```

차감 + 이력이 하나의 트랜잭션으로 묶이고, `SELECT FOR UPDATE`로 동시성도 보장된다. 동시성 테스트에서 차감 5건 = 이력 5건 100% 일치를 확인했다.

이 과정에서 금융/결제 시스템이 왜 RDBMS를 쓰는지, 서비스 특성에 맞는 DB 선택이 왜 중요한지를 체감했다.

### SAGA와 동시성 제어 — 둘 다 필요한 이유

이 둘은 완전히 다른 문제를 해결한다.

| 문제 | 원인 | 발생 위치 | 최종 해결책 |
|------|------|----------|------------|
| 부분 실패 (포인트 유실) | 서비스 간 트랜잭션 경계 | payment ↔ point 사이 | SAGA 보상 트랜잭션 |
| Lost Update / Overdraft | 동시 읽기-쓰기 충돌 | point-service 내부 | MySQL `SELECT FOR UPDATE` |
| 차감≠이력 불일치 | 별도 연산 (MongoDB) | point-service 내부 | MySQL `@Transactional` |

SAGA만 적용하면? → 보상 트랜잭션은 호출되지만, 동시성으로 인해 포인트 수치 자체가 틀어질 수 있다.
원자적 연산만 적용하면? → 단건 차감은 정확하지만, 서비스 간 부분 실패 시 롤백이 안 된다.

둘 다 있어야 결제 시스템이 안전하다. 이건 레이어가 다른 문제이고, 각각의 레이어에서 각각의 해결책이 필요하다.

### 최종 부하 테스트: 3단계 비교

단건 테스트로 동시성 제어가 동작하는 건 확인했다. 그런데 실제 부하 환경(300명 동시)에서도 안전한지가 중요하다. SAGA만 적용했을 때, SAGA + 동시성 제어를 모두 적용했을 때, 그리고 장애가 없는 정상 상황에서 각각 어떤 차이가 나는지 비교했다.

#### 장애 주입 10% 조건 (동시 50 → 100 → 200 → 300명)

| 지표 | ① 아무것도 없음 | ② SAGA만 | ③ SAGA + 동시성 제어 |
|------|:---:|:---:|:---:|
| 결제 시도 | 22,998건 | 22,737건 | 21,614건 |
| 성공률 | 89.65% | 90.02% | 89.63% |
| rollback_missing (포인트 유실) | 2,380건 | 18건 | 169건 |
| overdraft (마이너스 잔액) | 미측정 | 0건 | 0건 |
| point_inconsistency (이중차감) | 미측정 | 0건 | 1건 |

#### 장애 주입 없이 정상 상황 (동시 300명)

| 지표 | ③ SAGA + 동시성 제어 |
|------|:---:|
| 성공률 | 99.71% |
| rollback_missing | 52건 |
| overdraft | 0건 |
| point_inconsistency | 0건 |

#### 결과 해석

③에서 rollback_missing이 ②보다 늘어난 이유.

`findAndModify`가 document-level lock을 잡기 때문에, 같은 유저에 대한 동시 요청이 순차 처리된다. 이로 인해 포인트 차감 응답 시간이 길어지고, SAGA 보상 호출도 같은 lock 경합을 겪어 타임아웃이 증가한다. 동시성 제어의 트레이드오프: 안전성이 올라가는 대신 처리량이 줄어든다.

그래서 진짜 중요한 지표는 rollback_missing이 아니다.

| 지표 | 의미 | ③ 결과 |
|------|------|--------|
| overdraft | 없는 돈으로 결제됨 (플랫폼 금전 손해) | 0건 |
| point_inconsistency | 차감 금액 불일치 (회계 오류) | 0~1건 |
| rollback_missing | 보상 트랜잭션 타임아웃 (재시도로 복구 가능) | 52~169건 |

overdraft와 point_inconsistency가 0이라는 건, 돈 자체는 안전하다는 뜻이다. rollback_missing은 보상 호출의 네트워크 타임아웃으로, 이건 재시도 메커니즘으로 해결 가능한 영역이다.

#### 운영 레벨에서 rollback_missing을 0으로 만들려면

- Outbox Pattern: 보상 내역을 payment-service 로컬 DB에 먼저 저장 → 별도 스케줄러가 point-service에 재시도
- Dead Letter Queue: 보상 실패 건을 Kafka DLQ에 적재 → consumer가 재처리
- 정합성 배치: 일 1회 payment 기록과 point 이력을 대조, 불일치 건 자동 보정

현재 규모에서는 SAGA + 원자적 연산으로 충분하고, 서비스 성장에 따라 위 대책을 단계적으로 추가하면 된다.

---

## 9. DB 트랜잭션과 분산 트랜잭션의 근본적 차이

### 왜 `@Transactional`로 안 되는가

핵심은 트랜잭션 경계(Transaction Boundary)의 차이다.

```
[모놀리식] 하나의 JVM, 하나의 DB
┌─────────────────────────────────────────┐
│  @Transactional                          │
│  pointRepository.deduct()  ← 같은 DB     │
│  paymentRepository.save()  ← 같은 DB     │
│  → 실패 시 DBMS가 자동 롤백               │
└─────────────────────────────────────────┘

[마이크로서비스] 별도 JVM, 별도 DB
┌─ payment-service ──┐     ┌─ point-service ──┐
│                     │     │                   │
│  REST call ─────────┼────→│ usePoints()       │
│  (네트워크 경계)     │     │ point-db.save()   │
│                     │     │ ← 여기서 커밋됨    │
│  paymentRepo.save() │     └───────────────────┘
│  ← 여기서 실패하면?  │
│  point-db는 이미 커밋│
│  → 되돌릴 수 없음    │
└─────────────────────┘
```

RDBMS의 ACID 트랜잭션은 단일 DB 내에서만 유효하다. 서비스 경계를 넘는 순간, 네트워크가 개입하고, 각 서비스는 자기 DB만 관리하기 때문에 "전체를 하나의 트랜잭션으로 묶는 것"이 물리적으로 불가능하다.

SAGA는 이 문제를 "각 단계를 독립적으로 커밋하되, 실패 시 이전 단계를 보상 트랜잭션으로 되돌린다"는 전략으로 해결한다. 완벽한 원자성(Atomicity)은 아니지만, 최종 일관성(Eventual Consistency)을 보장한다.

---

## 10. 실무에서는 어떻게 처리하는가

### 네이버페이 / 카카오페이 — 결제 시스템

실제 PG사 결제 시스템에서는 SAGA보다 더 보수적인 접근을 쓴다.

1. 결제 상태 머신(State Machine): PENDING → AUTHORIZED → CAPTURED → COMPLETED 단계별 전이
2. 멱등성 보장: 같은 요청이 중복 들어와도 한 번만 처리 (idempotency key)
3. 정산 배치: 실시간 정합성 대신, T+1 정산에서 불일치 보정

### 배달의민족 / 쿠팡 — 주문 시스템

우아한형제들 기술블로그에 따르면.

> "주문 → 결제 → 재고 차감 → 배달 요청 체인에서 SAGA Orchestration을 사용한다. 각 단계의 보상 트랜잭션을 정의하고, 오케스트레이터가 실패 시 역순으로 보상을 실행한다."

### 토스 / 뱅크샐러드 — 금융 시스템

금융에서는 SAGA보다 이벤트 소싱(Event Sourcing)을 선호하는 경우가 많다.

- 모든 상태 변경을 이벤트로 저장
- 현재 상태 = 이벤트의 누적
- 롤백 = 보상 이벤트 추가
- 감사 추적(Audit Trail) 자연스럽게 확보

---

## 11. SAGA를 쓰지 않아도 되는 경우

SAGA는 만능이 아니다. 대부분의 경우 더 단순한 해결책이 있다.

### SAGA가 불필요한 경우

| 상황 | 더 나은 대안 |
|------|------------|
| 단일 DB에서 여러 테이블 조작 | `@Transactional` (DB 트랜잭션) |
| 비동기로 괜찮은 경우 | Kafka 이벤트 + 재시도 (eventual consistency) |
| 실패해도 비즈니스 영향 없음 | 로그만 남기고 무시, 배치 보정 |
| 2개 서비스, 단순 호출 | 단순 try-catch + 보상 (SAGA라 부르기 민망한 수준) |

### SAGA가 필요한 경우

| 상황 | 이유 |
|------|------|
| 금전이 오가는 트랜잭션 | 1원이라도 불일치가 장애 |
| 3개 이상 서비스가 순차 관여 | 보상 체인이 복잡해짐 |
| 동기 응답이 필수 (사용자 대기) | 비동기로 나중에 처리하면 UX 불량 |
| 실패 시 자동 복구 필수 | 수동 보정 불가능한 규모 |

### 왜 Orchestration SAGA인가

이 프로젝트의 결제 흐름은 "HMAC 검증 → 결제 수단 처리(포인트/카드) → 결제 기록 저장"으로 단계가 명확하고 순서가 고정이다. payment-service가 오케스트레이터로서 각 단계를 직접 호출하고, 실패 시 역순으로 보상한다.

Choreography(이벤트 기반) 방식도 있지만, 이 흐름에는 맞지 않다. 포인트 잔액이 부족하면 결제 자체를 즉시 중단해야 하는데, 비동기 이벤트로는 "잔액 부족 → 결제 중단" 흐름을 동기적으로 제어할 수 없다. 주문 이벤트 팬아웃(order → payment/point/search)처럼 결과를 기다릴 필요 없는 경우에는 Kafka(Choreography)가 맞지만, 결제처럼 즉시 응답이 필요한 경우에는 Orchestration이 적합하다.

배달의민족도 주문→결제→재고→배달 체인에서 Orchestration SAGA를 쓰고 있다. (우아한형제들 기술블로그)

---

## 12. 깨달음

1. 수업에서 배운 것과 직접 겪는 것은 다르다

학부 데이터베이스 수업에서 트랜잭션의 ACID 속성을 배웠고, 운영체제 시간에 동시성 제어와 뮤텍스, 세마포어도 배웠다. 개념 자체는 알고 있었다. 그런데 실제로 동시 300명이 같은 포인트를 차감하는 상황에서 "아, 이게 그때 배운 그 문제구나"라고 체감한 건 완전히 다른 경험이었다.

MongoDB는 애초에 이런 용도로 만들어진 DB가 아니었다. 대규모 비정형 데이터, 유연한 스키마, 수평 확장이 필요한 곳에서 강점을 가지는 DB이고, 상품 카탈로그처럼 카테고리별 스키마가 다른 데이터에는 여전히 최적이다. 하지만 금전 데이터처럼 매 연산마다 트랜잭션이 필수이고, 잔액 검증 + 차감 + 이력이 하나의 원자적 단위로 묶여야 하는 도메인과는 맞지 않았다.

이걸 직접 겪고 나니, 금융권이나 결제 시스템에서 왜 거의 예외 없이 MySQL/PostgreSQL 같은 RDBMS를 쓰는지 이해가 됐다. `@Transactional`로 여러 테이블 연산을 하나로 묶고, `SELECT FOR UPDATE`로 행 단위 락을 거는 게 이 도메인에서는 자연스러운 해결책이다. 그렇다고 RDBMS만 쓰란 얘기는 아니고, 서비스 특성에 맞는 DB를 고르는 게 중요하다는 걸 이 과정에서 체감했다.

SAGA도 마찬가지다. 이전 프로젝트(급여 정산 서비스)에서는 같은 DB 안에서 `@Transactional`의 트랜잭션 전파(Propagation.REQUIRED)로 A 클래스와 B 클래스의 연산을 하나의 트랜잭션으로 묶었다. 하나라도 실패하면 전부 롤백. 이게 당연한 줄 알았다.

그런데 MSA에서는 이게 안 통했다. payment-service가 point-service의 포인트를 차감하는 건 HTTP 호출이지 같은 DB 커넥션이 아니다. `@Transactional`은 하나의 DB 커넥션 안에서만 동작하기 때문에, 서비스가 다르면 트랜잭션 전파가 불가능하다. 포인트는 차감됐는데 결제 기록 저장에서 실패하면? 포인트만 날아간다. 롤백이 안 된다.

"아, 이 구조에선 `@Transactional`로는 안 되는구나. 서비스 경계를 넘는 트랜잭션은 직접 보상해야 하는구나." — 이게 SAGA가 필요하다는 걸 체감한 순간이었다.

그래서 보상 트랜잭션을 도입했다. 실제로 포인트가 날아가는 걸 부하 테스트 수치로 확인하고(22,998건 중 2,380건 유실), 보상 코드를 짜고, 다시 테스트해서 99.2%가 복구되는 걸 보기 전까지는 왜 필요한지 와닿지 않았다.

2. 도구는 본질에 맞게 써야 한다

동시성 문제를 MongoDB의 `findAndModify`로 해결한 뒤, 한 가지 찜찜한 게 남았다. 포인트 차감은 원자적으로 성공하는데, 이력 저장은 별도 연산이라 둘 사이에 불일치가 생길 수 있는 구조였다. MongoDB 4.0부터 multi-document 트랜잭션이 가능하니까 그걸로 묶으면 해결은 된다. 그런데 MongoDB 공식 문서를 읽어보니 이렇게 써 있었다.

> *"A distributed transaction incurs a greater performance cost over single document writes, and the availability of distributed transactions should not be a replacement for effective schema design."*

"트랜잭션에 의존하지 말고 스키마 설계로 해결하라"가 MongoDB의 설계 철학이었다. 그런데 금전 도메인은 매 연산마다 트랜잭션이 필수다. 잔액 확인 → 차감 → 이력 기록이 하나의 원자적 단위로 묶여야 하고, 그게 금전 데이터의 본질이다.

그래서 point-service를 MySQL로 리팩토링했다. `@Transactional` + `SELECT FOR UPDATE`로 차감+이력이 하나의 트랜잭션에 묶이고, 실제 동시성 테스트에서 차감 5건 = 이력 5건 100% 일치를 확인했다.

이 과정에서 깨달은 건, "기술에 문제를 맞추는 게 아니라, 문제에 기술을 맞춰야 한다"는 것이다. MongoDB가 나쁜 DB가 아니라, 금전 도메인에 맞지 않았을 뿐이다. 상품 카탈로그(카테고리별 스키마가 다른 유연한 구조)에는 MongoDB가 여전히 최적이다. NoSQL과 RDBMS는 경쟁이 아니라 용도가 다른 도구이고, 서비스 특성에 맞는 도구를 고르는 게 Polyglot Persistence의 핵심이었다.

그리고 이게 결국 마이크로서비스의 진짜 이유와 맞닿아 있었다. 처음에 MSA를 선택한 건 "요즘 다 MSA로 하니까" 정도의 이유였는데, 직접 서비스를 나누고, DB를 나누고, 서비스마다 다른 DB를 쓰게 되면서 비로소 이해했다. MSA의 본질은 독립 배포나 확장성이 아니라 "각 서비스가 자기 도메인에 가장 적합한 기술을 독립적으로 선택할 수 있다"는 것이다. 상품은 MongoDB, 포인트는 MySQL, 검색은 Elasticsearch — 모놀리식이었다면 하나의 DB에 묶여서 이런 선택 자체가 불가능했다. 서비스를 나눴기 때문에 각각의 문제에 각각의 최적 도구를 붙일 수 있었고, 그 과정에서 겪은 분산 트랜잭션, 동시성 제어, 이벤트 기반 통신 같은 문제들이 전부 MSA의 대가이자 MSA여서 해결할 수 있었던 것들이었다.

---

## 7. 낙관적 락(@Version)과 비관적 락(SELECT FOR UPDATE)의 충돌

### 문제 상황

주문 시 Kafka 이벤트로 포인트 적립(`earnPoints`)이 비동기로 실행되는데, 거의 동시에 결제 API에서 포인트 차감(`usePoints`)이 동기로 실행된다. 이 두 연산이 같은 `point` 행을 동시에 수정하면서 적립이 실패했다.

```
시간순:
  T1  POST /payment → usePoints() → SELECT ... FOR UPDATE → version=28 읽음
  T2  Kafka → earnPoints() → SELECT (일반 조회) → version=28 읽음
  T3  usePoints() → UPDATE ... WHERE version=28 → 성공 → version=29로 변경
  T4  earnPoints() → UPDATE ... WHERE version=28 → 실패 (DB에는 이미 version=29)
```

에러 메시지:
```
Batch update returned unexpected row count from update [0];
actual row count: 0; expected: 1;
statement executed: update point set available_points=?, total_points=?,
user_id=?, version=? where id=? and version=?
```

`actual row count: 0`은 `WHERE id=? AND version=?` 조건에 맞는 행이 0개라는 뜻이다. version이 이미 바뀌어서 해당 행을 찾지 못한 것.

### 왜 처음에 낙관적 락을 선택했는가

포인트 적립(`earnPoints`)은 결제 흐름과 별개로 Kafka 이벤트를 통해 비동기로 실행된다. 설계 시점에서는 다음과 같이 판단했다:

1. **적립은 차감과 동시에 일어나지 않을 것이다** — 주문 → Kafka 발행 → 소비까지 시간차가 있으니, 결제(차감)가 끝난 후에 적립이 실행될 거라고 예상했다.
2. **적립은 충돌이 드물 것이다** — 같은 사용자가 동시에 여러 건 주문하는 일은 드물고, 적립끼리 충돌할 일도 거의 없다.
3. **비관적 락은 불필요한 대기를 만든다** — `SELECT FOR UPDATE`는 행을 잠그므로, 읽기 트래픽까지 대기시킬 수 있다. 적립은 단순 증가 연산이니 낙관적 락으로 충분하다고 봤다.

그래서 차감(`usePoints`)은 잔액 검증이 필수라 비관적 락을, 적립(`earnPoints`)은 충돌이 드물다고 판단해 낙관적 락(`@Version` + 일반 SELECT)을 적용했다.

**하지만 이 판단은 틀렸다.** Kafka 소비 지연은 밀리초 단위로 매우 짧고, 결제 API 처리 시간과 거의 겹쳤다. 특히 포인트 결제 방식(POINT, CARD_AND_POINT)에서는 `usePoints()`와 `earnPoints()`가 사실상 동시에 같은 행을 수정하게 된다.

### 원인 — 같은 테이블에 두 가지 락 전략이 혼재

| 메서드 | 호출 경로 | 락 전략 | 쿼리 |
|--------|-----------|---------|------|
| `usePoints()` | 결제 API (동기) | 비관적 락 | `SELECT ... FOR UPDATE` |
| `earnPoints()` | Kafka 이벤트 (비동기) | 낙관적 락 | 일반 `SELECT` + `@Version` |

비관적 락(`SELECT FOR UPDATE`)은 행을 잠가서 다른 트랜잭션이 대기하게 만든다. 낙관적 락(`@Version`)은 잠금 없이 읽고, 커밋 시점에 version이 바뀌었으면 실패시킨다.

문제는 `earnPoints()`가 일반 `SELECT`로 조회하기 때문에, `usePoints()`의 `FOR UPDATE` 락을 무시하고 바로 읽어버린다는 점이다. 두 트랜잭션이 동시에 같은 version을 읽고, 먼저 커밋한 쪽이 이기고 나중 쪽은 `StaleStateException`으로 실패한다.

```
usePoints():   SELECT ... FOR UPDATE → 행 잠금 → version=28 읽음
earnPoints():  SELECT (일반) → 잠금 안 걸림 → version=28 읽음  ← 여기가 문제
usePoints():   UPDATE SET version=29 → 성공
earnPoints():  UPDATE WHERE version=28 → 0 rows → 실패
```

### 해결 — earnPoints도 비관적 락으로 통일

```java
// Before: 일반 조회 → 낙관적 락에 의존
public Point earnPoints(String userId, int amount, String description) {
    Point point = pointRepository.findByUserId(userId)  // 일반 SELECT
        .orElseGet(() -> { ... });
    point.setAvailablePoints(point.getAvailablePoints() + amount);
    // JPA dirty checking → UPDATE WHERE version=? → 충돌 시 실패
}

// After: SELECT FOR UPDATE → 비관적 락으로 순차 실행 보장
public Point earnPoints(String userId, int amount, String description) {
    Point point = pointRepository.findByUserIdForUpdate(userId)  // SELECT ... FOR UPDATE
        .orElseGet(() -> { ... });
    point.setAvailablePoints(point.getAvailablePoints() + amount);
    // 같은 행을 수정하는 다른 트랜잭션은 이 락이 풀릴 때까지 대기
}
```

`findByUserIdForUpdate()`는 `@Lock(LockModeType.PESSIMISTIC_WRITE)`로 선언된 JPA 메서드다:

```java
@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query("SELECT p FROM Point p WHERE p.userId = :userId")
Optional<Point> findByUserIdForUpdate(@Param("userId") String userId);
```

이렇게 바꾸면 `usePoints()`와 `earnPoints()`가 동시에 실행되어도 먼저 도착한 쪽이 행을 잠그고, 나중 쪽은 대기한다:

```
T1  usePoints():   SELECT ... FOR UPDATE → 행 잠금 → version=28
T2  earnPoints():  SELECT ... FOR UPDATE → 대기 (잠금 해제까지)
T3  usePoints():   UPDATE → version=29 → COMMIT → 잠금 해제
T4  earnPoints():  잠금 획득 → version=29 읽음 → UPDATE → version=30 → 성공
```

### 배운 점

**낙관적 락과 비관적 락을 같은 테이블에 섞으면 안 된다.** 낙관적 락(`@Version`)은 "충돌이 드물 때" 전제 하에 설계된 전략이다. 비관적 락과 섞으면, 비관적 락이 version을 바꿔버려서 낙관적 락 쪽이 항상 진다.

금전 도메인처럼 동시 수정이 잦은 테이블은 비관적 락으로 통일하는 게 안전하다. `@Version` 필드는 남겨두되(JPA 엔티티 호환), 실제 동시성 제어는 `SELECT FOR UPDATE`에 맡긴다.

| 전략 | 적합한 경우 | 부적합한 경우 |
|------|------------|-------------|
| 낙관적 락 (`@Version`) | 읽기 많고 충돌 드문 도메인 (프로필, 설정) | 금전, 재고 등 동시 수정 빈번한 도메인 |
| 비관적 락 (`FOR UPDATE`) | 금전, 재고 등 정합성이 최우선인 도메인 | 읽기 트래픽 많은 도메인 (락 대기 병목) |
| 혼용 | — | 같은 테이블에 섞으면 낙관적 락 쪽이 항상 실패 |

### 결론

락 전략은 "이론적으로 충돌이 드물 것 같다"가 아니라, **실제 호출 타이밍을 기준으로** 결정해야 한다.

이번 케이스에서 낙관적 락을 선택한 근거는 "Kafka 비동기니까 시간차가 있을 것"이었다. 하지만 Kafka 소비 지연은 수 밀리초에 불과했고, 결제 API 처리 시간(수십~수백 밀리초)과 완전히 겹쳤다. **비동기라는 구조적 특성이 곧 시간차를 보장하지는 않는다.**

금전 도메인에서 "아마 안 겹치겠지"라는 가정은 위험하다. 잔액이 틀어지면 실제 돈 문제가 되기 때문이다. 결국 금전처럼 정합성이 절대적인 테이블은 성능 비용(락 대기)을 감수하더라도 비관적 락으로 통일하는 것이 맞다. 낙관적 락은 충돌 시 재시도 로직까지 구현해야 의미가 있는데, Kafka 이벤트 소비 컨텍스트에서 재시도를 넣으면 복잡도만 올라간다. 처음부터 비관적 락으로 순차 실행을 보장하는 게 더 단순하고 안전한 선택이었다.

---

## 부록: 참고 자료

- Chris Richardson, *Microservices Patterns* — Chapter 4: Managing transactions with sagas
- 우아한형제들 기술블로그 — "회원시스템 이벤트기반 아키텍처 구축하기"
- 토스 기술블로그 — "Transaction Outbox Pattern 적용기"
- Martin Fowler — "Microservices Trade-Offs"
- Netflix Tech Blog — "Chaos Engineering"
- 카카오페이 기술블로그 — "결제 시스템의 멱등성"
