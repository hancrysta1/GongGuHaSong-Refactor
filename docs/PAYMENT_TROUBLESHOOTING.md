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
| 실패 유도 | 없음 (정상 환경) | 결제 요청 3초 타임아웃 + 부하로 자연 실패 |
| 검증 항목 | `point_inconsistency`, `overdraft_detected` | `rollback_missing` |

---

### 테스트 1: 동시성 검증 (`payment-concurrency-test.js`)

실패 유도 없이, 순수하게 동시 사용자를 최대 1000명까지 올린다.

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

동시성은 300명으로 고정하고, **결제 요청 타임아웃을 3초로 짧게 강제**해서 부하 중 자연스럽게 발생하는 결제 실패를 활용한다.

#### 어떻게 결제 실패를 만드는가

k6의 `http.post(...)`에 `timeout: '3s'` 옵션을 줘서, 결제 응답이 3초 안에 안 오면 클라이언트가 요청을 끊는다. 이때 서버에서는 이미 STEP 2(포인트 차감)까지 진행됐을 수 있지만, 클라이언트는 200을 받지 못했으므로 결제 실패로 인지 → "포인트는 차감됐는데 결제 기록은 없는 상태"가 만들어진다.

```javascript
// load-test/saga-detail-test.js
const payRes = http.post(`${PAYMENT_URL}/payment`, JSON.stringify({...}), {
    headers,
    timeout: '3s'   // ← 핵심: 부하 중 응답 지연이면 자연 실패
});
```

#### 왜 타임아웃을 짧게 거는가?

처음에는 타임아웃 없이 단건으로 테스트했는데, localhost에서는 모든 호출이 5ms 내에 끝나서 부분 실패가 거의 발생하지 않았다. 실제 운영 환경(서로 다른 서버, 네트워크 홉, AZ 간 통신)에서는 지연과 타임아웃이 빈번하지만, 로컬에서는 재현이 어렵다.

그래서 클라이언트 타임아웃을 의도적으로 짧게(3초) 잡아 부하가 올라가면 일부 결제가 자연스럽게 실패하도록 만들었다. 부하가 쌓일수록 응답 지연이 늘고, 타임아웃을 넘기는 결제가 늘어나면서 실패 분포가 자연스럽게 분포된다.

#### 테스트 시나리오

```
0:00~1:00  — 50명 동시 결제 (타임아웃 3초)
1:30~2:30  — 100명
3:00~4:00  — 200명
4:30~5:30  — 300명
```

총 건수(약 22,998건)는 목표치가 아니라, 위 시나리오를 실행했을 때 처리된 결과값이다. 단계적으로 올린 이유는 50명에서 정상이어도 300명에서 문제가 발생할 수 있기 때문이다. VU 수가 늘수록 응답 지연이 누적되어 자연 실패율도 함께 올라간다.

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
| 4:30~5:30 | 피크 트래픽 | 300명 — 최대 동시성에서 타임아웃 누적 + 이중 차감 발생 여부 검증 |

- **3초 타임아웃** — 실제 운영에서 서버 간 네트워크가 느려지거나 끊기는 상황 재현. 부하가 올라갈수록 응답 지연이 누적되어 자연스럽게 일부 결제가 타임아웃되고, 이 시점에 "포인트는 차감됐는데 결제 기록은 없는" 부분 실패가 발생.

핵심은 **"부분 실패가 일어나는 최악의 타이밍"을 부하만으로 자연스럽게 만든 것**이다. 포인트 차감은 성공했는데 결제 기록 저장 전에 클라이언트가 응답을 못 받는 순간 — 이 타이밍이 실제 운영에서 돈이 사라지는 원인이고, 이 테스트는 정확히 그 구간을 짧은 타임아웃으로 재현한다.

---

## 5. SAGA 적용 전 결과 (Before)

```
█ THRESHOLDS

  rollback_missing
  ✗ 'count<1' count=2380        ← 포인트 유실 2,380건

█ TOTAL RESULTS

  결제 시도:        22,998건
  결제 성공:        20,618건 (89.65%)
  결제 실패:         2,380건 (10.35%) ← 부하 + 3초 타임아웃 자연 실패율
  rollback_missing:  2,380건         ← 실패한 건 100%가 포인트 유실
  success_rate:      89.65%
```

결제가 실패한 2,380건 전부에서 포인트가 차감된 채 복구되지 않았다.

실패한 건의 100%가 포인트 유실 — 현재 코드에 보상 트랜잭션이 전혀 없기 때문.

일 10만 건 결제 기준으로 환산하면, 같은 실패율에서 매일 약 10,000건의 포인트 유실이 발생한다. 실패율이 1%라 해도 매일 1,000건. 결제 도메인에서 이건 허용 불가능한 수치다.

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

이 과정에서 분산 환경에서 SAGA가 동작하는 방식을 이해하게 됐다. 모든 단계가 동시에 완벽히 맞아떨어지는 건 불가능하고, **최종적으로 맞아떨어지도록 설계**하는 것이었다.

---

## 7. SAGA 적용 후 결과 (After)

동일한 타임아웃 조건(3초), 동일한 부하 조건에서 재측정.

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

| 지표 | Before (보상 없음) | SAGA only (Outbox 없음) | SAGA + Outbox |
|------|-------------------|------------------------|---------------|
| 총 결제 | 7,263건 | 7,128건 | 7,408건 |
| 타임아웃 자연 실패 | ~726건 | ~712건 | ~740건 |
| 포인트 유실 (실시간) | 656건 (90.4%) | 691건 (97.1%) | 854건 |
| DB 최종 유실 | 656건 | 691건 | **0건** |

> 최신 결과는 [LOAD_TEST.md](LOAD_TEST.md) 참고

### SAGA only에서 오히려 악화된 이유

SAGA 보상이 point-service에 추가 REST 호출을 보내면서 DB 커넥션 풀이 고갈됐다. Outbox를 도입해서 보상 실패 건을 로컬 DB에 저장하고 트래픽이 줄어든 후 재시도하면 최종 유실 0건이 됐다. 자세한 분석은 [LOAD_TEST.md](LOAD_TEST.md)에 정리했다.

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

#### k6 재고 동시성 테스트 — 재고 100개에 300명 동시 주문

```
k6 run 1-stock-before.js

  재고 100개 상품에 300명이 동시 주문
  성공: 300건 (100건만 성공해야 정상)
  최종 재고: 33개 (0이어야 정상)
```

**300명 전원 성공 + 재고 33개 남음.** 재고 100개짜리 상품을 300명에게 다 팔아버렸다. 200명에게 "재고 부족"을 줬어야 하는데 전부 통과했고, 재고도 67개만 차감됐다.

이게 왜 발생하는가? "재고 부족이면 거절" 로직이 분명히 있는데도 발생한다.

```java
// RegistrationController.java (order-service)
int stock = ((Number) product.get("stock")).intValue();  // ① 재고 조회
if (stock < dto.getTotal_Count()) {                       // ② 재고 체크
    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "재고가 부족합니다");
}
Registration registration = registrationRepository.save(...);              // ③ 주문 저장
productServiceClient.decrementStock(productId, dto.getTotal_Count());      // ④ 재고 차감
```

①~④가 분리되어 있어서, 300명이 동시에 ①을 실행하면 전부 `stock=100`을 읽고 ②를 통과한다. ④에서 차감할 때도 MongoDB `findById` → `save`라서 동시에 읽으면 같은 값에서 뺀다.

```
VU-1: stock=100 읽음 → 100-1=99 저장
VU-2: stock=100 읽음 → 100-1=99 저장  ← 같은 100에서 뺌
VU-3: stock=100 읽음 → 100-1=99 저장  ← 또 같은 100에서 뺌
→ 3건 차감됐는데 재고는 99 (2건 유실)
```

"재고 부족이면 거절" 로직이 있어도, **조회와 차감 사이에 잠금이 없으면 300명이 전부 `stock=100`을 읽고 전부 통과한다.** Read-Check-Write 패턴의 근본적인 문제였다.

#### 해결 — MongoDB findAndModify

재고는 포인트와 달리 "숫자 하나를 빼는" 단순 연산이다. 차감 + 이력을 트랜잭션으로 묶어야 하는 포인트와 달리, 재고는 MongoDB의 `findAndModify`로 해결할 수 있다.

`findAndModify`는 MongoDB가 제공하는 원자적(atomic) 연산이다. "조건에 맞는 문서를 찾아서 수정하라"를 **DB 엔진 레벨에서 한 번에** 처리한다. 읽기와 쓰기 사이에 다른 요청이 끼어들 틈이 없다.

```java
// Before: findById → 체크 → save (3단계 분리 → race condition)
Sell sell = sellRepository.findById(id).orElseThrow(...);
int newStock = sell.getStock() - amount;
if (newStock < 0) throw new ResponseStatusException(..., "재고가 부족합니다.");
sell.setStock(newStock);
sellRepository.save(sell);

// After: findAndModify (1단계 원자적)
Query query = Query.query(
    Criteria.where("_id").is(id).and("stock").gte(amount)  // 조건: 재고 >= 요청량
);
Update update = new Update().inc("stock", -amount);         // 수정: 재고 -= amount
Sell result = mongoTemplate.findAndModify(
    query, update,
    FindAndModifyOptions.options().returnNew(true),          // 수정 후 값 반환
    Sell.class
);
if (result == null) throw new ResponseStatusException(..., "재고가 부족합니다.");
```

왜 이게 가능한가? MySQL의 `SELECT FOR UPDATE`는 "행을 잠그고 → 읽고 → 수정 → 잠금 해제"를 트랜잭션으로 묶는 방식이다. MongoDB에는 행 잠금이 없지만, `findAndModify`는 애초에 잠글 필요가 없다. 찾기와 수정을 DB 내부에서 하나의 명령으로 실행하기 때문이다.

| | Read-Check-Write (Before) | findAndModify (After) |
|---|---|---|
| 실행 단계 | ① DB 조회 → ② 앱에서 체크 → ③ DB 저장 | DB에서 조건 체크 + 수정을 한 번에 |
| 중간에 끼어들 수 있나 | ①~③ 사이에 다른 요청 끼어듦 | 불가능 (원자적) |
| 재고 부족 거절 | ②에서 체크하지만 ①이 오래된 값 | 조건 자체가 쿼리에 포함 |

**그럼 포인트도 findAndModify로 하면 되지 않나?**

#### 그럼 재고도 MySQL로 옮겨야 하나?

재고는 MongoDB를 그대로 유지했다. 숫자 1개를 빼는 게 전부라 `findAndModify`면 충분했고, 굳이 MySQL로 옮겨서 `SELECT FOR UPDATE`를 걸 이유가 없었다.

포인트는 달랐다. 잔액 차감과 이력 저장이 반드시 같이 이루어져야 하는데, `findAndModify`는 단일 문서 연산이라 둘을 묶을 수 없었다. 차감은 됐는데 이력이 누락되는 위험이 구조적으로 남아서, MySQL `@Transactional`로 전환해 여러 테이블 연산을 하나로 묶었다.

그리고 MySQL에서도 `SELECT FOR UPDATE`가 항상 필요한 건 아니었다. 단일 요청이면 일반 `SELECT` + `UPDATE`로도 충분하다. 락을 건 건 Kafka 포인트 적립(`earnPoints`)과 결제 포인트 차감(`usePoints`)이 동시에 같은 유저의 포인트를 수정할 수 있어서였다.

| 도메인 | 연산 | DB | 동시성 제어 | 왜 |
|--------|------|----|------------|-----|
| 재고 | 숫자 1개 차감 | MongoDB 유지 | `findAndModify` | 단일 문서 원자성으로 충분, 전환 불필요 |
| 포인트 | 잔액 차감 + 이력 저장 | MongoDB → MySQL 전환 | `@Transactional` + `SELECT FOR UPDATE` | 다중 테이블 트랜잭션 + 동시 수정 대응 |

#### 성능 차이

둘 다 동시성은 보장하지만, 대규모 동시 요청에서 체감 차이가 컸다.

MongoDB `findAndModify`는 DB 엔진 내부에서 조건 체크 + 수정을 하나의 명령으로 처리한다. 잠금 없이 명령 자체가 원자적이라 10,000명이 동시에 요청해도 순차 처리가 빠르게 끝났다.

MySQL `SELECT FOR UPDATE`는 행을 잠그고 트랜잭션이 끝날 때까지 유지한다. 여러 테이블을 조작할 수 있는 대신, 동시 요청이 많으면 대기 큐가 쌓인다. SAGA 보상 테스트에서 `HikariPool - Connection is not available` 에러가 발생한 것도 이 대기 때문이었다.

| | MongoDB `findAndModify` | MySQL `SELECT FOR UPDATE` |
|---|---|---|
| 정합성 | 보장 | 보장 |
| 원자성 범위 | 단일 문서 | 다중 테이블 (트랜잭션) |
| 잠금 | 없음 (명령 자체가 원자적) | 행 잠금 (트랜잭션 종료까지) |
| 동시 10,000명 | 빠름 (대기 없음) | 느림 (대기 큐) |
| 커넥션 풀 부하 | 낮음 | 높음 (대기 중 커넥션 점유) |
| 락이 필요한 시점 | 별도 락 불필요 | 동시 수정이 있을 때만 |

k6 재고 동시성 테스트에서 300명 → 3,000명 → 10,000명으로 늘려도 `findAndModify`는 정확히 재고(100건)만 성공시키고 나머지를 거절했다. 요청 수에 관계없이 성공 건수가 재고로 고정됐다. 앱 레벨 잠금이 아니라 DB 엔진 레벨 원자성이라 가능한 것이었다. 로컬 하드웨어 한계로 10,000명 이상은 테스트하지 못했지만, 이 패턴이 유지되는 이상 더 큰 규모에서도 정합성은 보장될 것으로 보고 있다.

`findAndModify`가 원자적이면 부하 테스트가 필요 없지 않나 싶을 수 있는데, DB 연산의 정합성과 서비스 전체의 가용성은 별개 문제였다. 300명이 동시에 order-service → product-service를 Feign으로 호출하면 스레드 풀, Feign 타임아웃, 응답 지연 등 DB 바깥에서 문제가 생길 수 있다. 부하 테스트로 확인한 건 두 가지였다.

- 정합성: 몇 명이 몰려도 재고 이상 안 팔리는가 → `findAndModify`로 보장 확인
- 가용성: 10,000명이 몰려도 서비스가 뻗지 않고 응답하는가 → Docker 단일 인스턴스에서 10,000명까지 정상 처리 확인

정합성은 DB 레벨에서 보장되지만, 이 로직과 인프라 설정이 실제 부하를 버티는지는 부하를 걸어봐야 알 수 있었다. 10,000명 동시 요청에서 서비스가 뻗지 않고 정확히 100건만 성공시킨 것으로 검증했다.

처음에는 MongoDB 하나로 다 하면 되지 않나 싶었는데, 도메인마다 요구사항이 달랐다. 재고는 MongoDB에서 `findAndModify`로 충분했고 전환할 필요가 없었다. 포인트는 차감 + 이력을 묶어야 해서 MySQL로 전환했고, 그 덕에 `@Transactional`과 `SELECT FOR UPDATE`의 이점을 누릴 수 있었다. 같은 숫자를 빼는 연산이라도 도메인에 따라 적합한 DB가 다르다는 걸 직접 경험하면서 배웠다.

#### k6 재고 동시성 After 테스트

findAndModify 적용 후 동일 조건에서 재테스트.

```
k6 run 2-stock-after.js

  재고 100개 상품에 300명이 동시 주문
  성공: 100건 (정확히 100)
  최종 재고: 0개 (정확히 0)
```

| | Before | After |
|---|---|---|
| 300명 주문 성공 | 300명 전원 (초과 판매) | 100명만 성공 |
| 최종 재고 | 33개 (233건 유실) | 0개 (정확히 100건 차감) |
| 원인 | Read-Check-Write 분리 | findAndModify 원자적 처리 |

시나리오 1: Lost Update (재고) — 상세
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

실제로 여러 커머스에서 "한정 수량 상품이 재고 이상으로 팔린" 사건이나 "쿠폰이 수만 장 복사된" 사건이 이 동시성 미처리에서 비롯된 것으로 알려져 있다.

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

#### 3초 타임아웃 조건 (동시 50 → 100 → 200 → 300명)

| 지표 | ① 아무것도 없음 | ② SAGA만 | ③ SAGA + 동시성 제어 |
|------|:---:|:---:|:---:|
| 결제 시도 | 22,998건 | 22,737건 | 21,614건 |
| 성공률 | 89.65% | 90.02% | 89.63% |
| rollback_missing (포인트 유실) | 2,380건 | 18건 | 169건 |
| overdraft (마이너스 잔액) | 미측정 | 0건 | 0건 |
| point_inconsistency (이중차감) | 미측정 | 0건 | 1건 |

#### 타임아웃 여유(10초) 정상 상황 (동시 300명)

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

"트랜잭션에 의존하지 말고 스키마 설계로 해결하라"가 MongoDB의 설계 철학이었다. 그런데 금전 도메인은 매 연산마다 트랜잭션이 필수였다. 잔액 확인 → 차감 → 이력 기록이 하나의 원자적 단위로 묶여야 했고, 이걸 직접 겪으면서 금전 데이터에 RDBMS가 필요한 이유를 이해하게 됐다.

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

## 8. 멱등성 — 클라이언트 타임아웃과 서버 성공의 간극

### 문제 상황

k6 부하 테스트에서 300명 동시 결제 55,389건을 돌렸을 때, SAGA 보상은 정상 동작했지만 `rollback_missing`이 6건 발생했다.

```
[ROLLBACK_MISSING] user=saga-user-72  before=985100 after=985000 lost=100P httpStatus=0 duration=3006ms
[ROLLBACK_MISSING] user=saga-user-252 before=988000 after=987900 lost=100P httpStatus=0 duration=3001ms
```

`httpStatus=0`, `duration=3001ms` — 전부 타임아웃이다. k6가 3초 안에 응답을 못 받아서 "실패"로 판단했는데, 서버에서는 이미 포인트를 차감하고 결제를 완료한 상태였다.

```
시간순:
  T0  클라이언트 → POST /payment (orderId=abc)
  T1  서버: 포인트 100P 차감
  T2  서버: 카드 결제 처리 중...
  T3  클라이언트: 3초 타임아웃 → "실패했네" 판단
  T4  서버: 결제 완료, DB 저장 → "성공!" (근데 클라이언트는 이미 끊음)
```

클라이언트는 실패로 알고 있고, 서버는 성공으로 처리한 상태. 사용자 입장에서 "돈은 빠졌는데 결제 실패래"가 되는 문제다.

### 이건 SAGA로 해결할 수 없다

SAGA 보상 트랜잭션은 **서버에서 실패한 경우** 이전 단계를 되돌리는 메커니즘이다. 하지만 이 6건은 서버에서 성공한 건이다. 서버 입장에서는 아무 문제가 없기 때문에 보상 대상이 아니다.

문제의 본질은 네트워크의 불확실성이다. 요청은 전달됐지만 응답이 돌아오지 않았을 때, 클라이언트는 "성공인지 실패인지" 알 수 없다. 이걸 분산 시스템에서는 **"두 장군 문제(Two Generals Problem)"** 라고 한다.

### 해결 — 멱등성 키(Idempotency Key)

같은 `orderId`로 다시 요청해도 결제가 중복 처리되지 않도록 보장한다.

**1단계: createPayment 진입부에 중복 체크 추가**

```java
public Payment createPayment(String orderId, ...) {
    // 같은 orderId로 이미 완료된 결제가 있으면 그대로 반환
    Optional<Payment> existing = paymentRepository
        .findByOrderIdAndStatus(orderId, "COMPLETED");
    if (existing.isPresent()) {
        log.info("[IDEMPOTENT] 이미 처리된 결제 반환: orderId={}", orderId);
        return existing.get();
    }

    // ... 실제 결제 처리
}
```

**2단계: 결제 상태 조회 API 추가**

```java
// GET /payment/order/{orderId}
public Payment getPaymentByOrderId(String orderId) {
    List<Payment> payments = paymentRepository.findByOrderId(orderId);
    if (payments.isEmpty()) {
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "결제 정보 없음");
    }
    return payments.get(0);
}
```

**클라이언트 흐름:**

```
POST /payment (orderId=abc) → 타임아웃
    │
    └─ GET /payment/order/abc → 200 (COMPLETED) → 서버에서 성공한 거였음 → 성공 처리
                               → 404             → 진짜 실패 → 같은 orderId로 재시도
                                                                (멱등성 보장 → 중복 처리 없음)
```

### 왜 결제 시스템은 전부 이렇게 하는가

토스, 카카오페이, 네이버페이 등 실제 결제 시스템은 전부 멱등성 키 기반이다. 이유는 단순하다:

1. **네트워크는 본질적으로 불안정하다** — 서버가 완벽해도 응답이 중간에 끊길 수 있다
2. **클라이언트는 재시도할 수밖에 없다** — 타임아웃 시 재시도하지 않으면 사용자가 답이 없다
3. **재시도 시 중복 결제가 나면 안 된다** — 멱등성 키가 없으면 같은 결제가 2번 처리된다

SAGA가 "서버 내부 실패"를 해결한다면, 멱등성은 "클라이언트-서버 사이의 불확실성"을 해결한다. 둘은 다른 계층의 문제이고, 결제 시스템에서는 둘 다 필요하다.

| 계층 | 문제 | 해결 |
|------|------|------|
| 서버 내부 | 결제 중 일부 단계 실패 → 이전 단계 유실 | SAGA 보상 트랜잭션 |
| 클라이언트-서버 | 응답 유실 → 성공/실패 불명 | 멱등성 키 + 상태 조회 API |
| 보상 실패 | SAGA 보상마저 실패 | CompensationOutbox 재시도 |

---

## 부록: 참고 자료

- Chris Richardson, *Microservices Patterns* — Chapter 4: Managing transactions with sagas
- 우아한형제들 기술블로그 — "회원시스템 이벤트기반 아키텍처 구축하기"
- 토스 기술블로그 — "Transaction Outbox Pattern 적용기"
- Martin Fowler — "Microservices Trade-Offs"
- Martin Fowler — "Microservices Testing: Saga Pattern"
- 카카오페이 기술블로그 — "결제 시스템의 멱등성"
