# 공구하송 — 공동구매 플랫폼 리팩토링

> MSA 환경에서 결제 정합성을 어떻게 보장했는가

---

## 프로젝트 정보

| 항목 | 내용 |
|------|------|
| 원본 개발 | 2022.03 ~ 2022.06 (4명, 본인: 백엔드) |
| 리팩토링 | 2025.10 ~ 2026.03 (1인, 아키텍처/결제/검색/인프라 전체) |
| 수상 | 숙명여대 SOLUX 27기 상반기 우수상 |

### 한 줄 요약

MSA 분산 환경에서 결제 장애 시 포인트 유실 90.4% → SAGA + Outbox로 0건, Redis 분산 락으로 처리량 34%↑ · p95 35%↓

### 내가 한 것 (리팩토링)

- 모놀리식 → MSA 6개 서비스 분리.
- 결제 시스템 신규 구축 (포인트/카드, SAGA 보상 트랜잭션, 동시성 제어).
- Elasticsearch + Nori 한국어 검색 엔진 + 실시간 랭킹 구축.
- MongoDB → MySQL 리팩토링 (금전 도메인 ACID 보장).
- k6 부하 테스트 (결제 타임아웃 3초 강제 + 부하로 자연 실패 유도, 동시 300명 22,000건).
- Eureka/API Gateway 제거 (Docker Compose 서비스명 호출로 대체).

### 팀이 한 것 (원본)

- 공구 참여 요청, 쪽지, 찜, 회원가입 기능 개발.
- MongoDB 설계, React 프론트엔드.

---

## 왜 리팩토링했는가

원래 프로젝트는 "공구 참여 요청"까지만 가능한 커뮤니티 사이트였음. 결제도 없고, 재고 관리도 없고, 갯수는 본인이 직접 입력하는 구조.

이걸 누구나 실시간으로 결제하고 참여할 수 있는 쇼핑몰 수준의 플랫폼으로 확장하고 싶었음.

| | Before (2022, 팀) | After (리팩토링, 1인) |
|---|---|---|
| 컨셉 | 교내 공구 참여 + 쪽지 커뮤니티 | 쇼핑몰형 공구 플랫폼 |
| 구매 | 참여 요청만 (결제 없음, 갯수 직접 입력) | 포인트/카드 실시간 결제, +/- 수량 조절 |
| 재고 | 없음 | 자동 차감, 최소수량 달성률 표시 |
| 검색 | 없음 | ES + Nori 한국어 검색, 실시간 랭킹 (신규) |
| 아키텍처 | 모놀리식 Spring Boot | MSA 6개 서비스 + Docker Compose |
| DB | MongoDB 1개 | MongoDB + MySQL + ES (Polyglot) |
| 트래픽 | 고려 없음 | k6 부하 테스트 22,000건, 동시 300명 |

---

## 서비스 구조도

```
                              ┌──────────────────────────────────────────────┐
                              │           Docker Compose 환경                │
                              │                                              │
Browser ──REST──→ Nginx ──────→ │  Member   Product   Order   Payment  Point  │
(React)                       │  :8081    :8082    :8083   :8085    :8084   │
                              │  MongoDB  MongoDB  MongoDB  MySQL    MySQL  │
                              │           +Redis     │              +Redis  │
  │                           │                      │ Kafka: order-events  │
  │                           │                      ▼                      │
  └──── WebSocket ←───────────│── Search (:8086, ES+Nori+MongoDB)            │
     (실시간 랭킹)             │   랭킹 = 검색횟수×0.4 + 주문량×0.6           │
                              │                                              │
                              │  ─ Kafka ─  ─ Redis ─  ─ Zookeeper ─       │
                              │  ─ MongoDB ─  ─ MySQL ─  ─ ES ─            │
                              └──────────────────────────────────────────────┘
```

---

## 데이터 모델 (ERD)

MSA에서는 서비스 간 DB가 물리적으로 분리되어 있어 외래키(FK) 대신 userId, orderId 같은 논리적 참조로 관계를 맺음.
서비스 내부는 같은 DB이므로 JPA 관계 매핑 가능. 서비스 간은 API/Kafka로만 통신.

```
┌─── point_db (MySQL) ─────────────────────────┐
│                                               │
│  ┌─────────────────────┐   userId  ┌────────────────────────┐
│  │       point          │◄─────────│    point_history        │
│  ├─────────────────────┤   (1:N)   ├────────────────────────┤
│  │ PK  id (BIGINT)      │           │ PK  id (BIGINT)        │
│  │ UK  user_id (VARCHAR)│           │     user_id (VARCHAR)  │
│  │     total_points     │           │     amount (INT)       │
│  │     available_points │           │     type (EARN/USE/    │
│  │     version (낙관적락)│           │           CANCEL)      │
│  └─────────────────────┘           │     description        │
│                                     │     created_at         │
│                                     └────────────────────────┘
└───────────────────────────────────────────────┘
         ▲ userId (논리적 참조, FK 없음 — 서비스 경계)
         │
┌─── payment_db (MySQL) ───────────────────────────────────────────┐
│                                                                   │
│  ┌─────────────────────────┐  cardId  ┌────────────────────────┐ │
│  │       payment            │·········→│       cards             │ │
│  ├─────────────────────────┤  (N:1)   ├────────────────────────┤ │
│  │ PK  id (BIGINT)          │          │ PK  id (BIGINT)        │ │
│  │     order_id ·····················→ │     user_id            │ │
│  │     user_id              │  (논리적)│     card_number        │ │
│  │     title                │          │     card_company       │ │
│  │     quantity, unit_price │          │     credit_limit       │ │
│  │     total_amount         │          │     used_amount        │ │
│  │     point_used           │          │     is_default         │ │
│  │     card_amount          │          │     status (ACTIVE)    │ │
│  │     status (COMPLETED/   │          └────────────────────────┘ │
│  │            REFUNDED)     │                                     │
│  │     payment_method       │  ┌────────────────────────────┐    │
│  │     approval_number      │  │    stock_reservation        │    │
│  │     created_at           │  ├────────────────────────────┤    │
│  └─────────────────────────┘  │ PK  id (BIGINT)             │    │
│                                │     product_id ···→ (sell._id) │ │
│                                │     title, user_id          │    │
│                                │     quantity                │    │
│                                │     status (RESERVED/       │    │
│                                │            CONFIRMED/       │    │
│                                │            RELEASED)        │    │
│                                │     expires_at (30분 TTL)   │    │
│                                └────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────┘
```

범례.
- `──→` : 같은 DB 내 참조 (JPA 관계 매핑 가능)
- `···→` : 서비스 간 논리적 참조 (FK 없음, API/Kafka로 통신)
- `PK` : Primary Key, `UK` : Unique Key

### Polyglot Persistence

| 서비스 | DB | 선택 근거 |
|--------|-----|----------|
| product | MongoDB | 카테고리별 스키마가 다름 (의류→사이즈, 문구→색상). |
| order | MongoDB | 주문 상태 관리. |
| member | MongoDB | 단순 CRUD. |
| point | MySQL | 금전 도메인. `@Transactional` + `SELECT FOR UPDATE`. |
| payment | MySQL | 금전 도메인. SAGA 보상 + ACID 보장. |
| search | ES + MongoDB | 한국어 형태소 검색(Nori) + 로그. |

---

## 기술 스택

| 분류 | 기술 |
|------|------|
| Backend | Spring Boot 2.7, Java 11, OpenFeign |
| Database | MongoDB, MySQL, Elasticsearch (Nori), Redis |
| Message | Apache Kafka, WebSocket (STOMP) |
| Infra | Docker Compose |
| Test | k6 (타임아웃 단축 + 부하로 자연 실패 유도) |
| Frontend | React 18 |

---

## 결제 트러블슈팅 — 문제 발견부터 해결까지

### 1. 문제: 분산 환경에서 결제가 실패하면 돈이 사라진다

payment-service와 point-service가 분리된 MSA 구조에서, 결제 흐름은 다음과 같다:

```
클라이언트 → payment-service → point-service (포인트 차감, Feign 동기)
                             → 카드 결제
                             → DB 저장
```

포인트는 이미 차감됐는데, 그 다음 단계(카드 결제 or DB 저장)에서 실패하면?

```java
// PaymentService.createPayment()

// STEP 2: 포인트 차감 (point-service Feign 동기 호출)
pointRestClient.usePoints(userId, pointUsed, "결제");
pointDeducted = true;  // ← 여기까지 성공

// STEP 3: DB 저장 ← 부하 중 응답 지연으로 클라이언트 타임아웃 시?
Payment saved = paymentRepository.save(payment);
```

**포인트는 차감됐는데 클라이언트는 결제 실패로 인지 → 유실.**

포인트 차감을 Feign 동기 호출로 하는 이유는, 잔액 확인 → 차감 → 결제 진행의 순서가 보장돼야 하기 때문이다. Kafka(비동기)로 하면 카드 결제가 먼저 완료된 후에 잔액 부족을 알게 되는 문제가 생긴다. (반면 적립은 실패해도 나중에 보상하면 되므로 Kafka 비동기로 처리한다.)

그런데 동기든 비동기든 MSA에서는 서비스 간 트랜잭션이 분리된다. 모놀리식이었으면 같은 DB, 같은 `@Transactional`로 롤백되지만, MSA에서는 point-service가 별도 DB를 가지고 있고 Feign 호출 시점에 point-service의 트랜잭션이 이미 커밋된다. payment-service에서 롤백해도 point-service의 차감은 되돌릴 수 없다.

**부하 테스트로 확인** — k6로 300명 동시 결제, **결제 요청 타임아웃을 3초로 강제**해서 부하가 올라가면 일부 결제가 응답 대기 중 끊기도록 자연 실패를 유도:

```
총 결제:      7,263건
타임아웃 실패: ~726건 (3초 초과로 클라이언트가 끊음)
포인트 유실:   656건 (유실률 90.4%)
```

### 2. 해결 1차: SAGA 보상 트랜잭션 → 오히려 악화

실패 시 역순으로 보상하는 SAGA 패턴을 적용했다:

```java
// PaymentService.createPayment() — catch 블록

} catch (Exception e) {
    // 역순 보상
    if (cardCharged) {
        cardService.refundCardPayment(cardId, cardAmount);      // 3. 카드 환불
    }
    if (pointDeducted) {
        pointRestClient.cancelPoints(userId, pointUsed, "복구"); // 2. 포인트 복구
    }
    if (productId != null) {
        productRestClient.restoreStock(productId, quantity);     // 1. 재고 복구
    }
}
```

**결과: 오히려 악화**

```
총 결제:    7,128건
포인트 유실: 691건 (유실률 97.1%)  ← 90.4%에서 악화
```

**원인:** 보상 호출 자체가 point-service로의 Feign 요청이다. 300명이 동시에 결제하면서 동시에 보상까지 발생하면, point-service로의 요청이 2배로 늘어난다.

```
결제 실패 → 보상 호출 → point-service 부하 증가
→ HikariPool-1: Connection is not available, request timed out after 30001ms
→ 보상도 실패 → 유실
```

보상 로직이 시스템에 추가 부하를 주는 구조이기 때문에, 부하가 높을 때 보상이 가장 필요한 순간에 보상이 실패한다.

### 3. 해결 2차: CompensationOutbox — 즉시 실패해도 나중에 복구

보상 호출이 실패하면 로컬 DB에 저장하고, 트래픽이 줄었을 때 재시도한다:

```java
// PaymentService.createPayment() — catch 블록 (Outbox 적용 후)

if (pointDeducted) {
    try {
        pointRestClient.cancelPoints(userId, pointUsed, "복구");
    } catch (Exception ex) {
        // 보상 실패 → Outbox 테이블에 저장
        compensationService.saveFailedCompensation(
            orderId, userId, "POINT_RESTORE", pointUsed, null, ex.getMessage());
    }
}
```

```java
// CompensationService.java — 30초 폴링 재시도

@Scheduled(fixedRate = 30000)
public void retryFailedCompensations() {
    List<CompensationOutbox> pendings =
        outboxRepository.findByStatusAndRetryCountLessThan("PENDING", 5);

    for (CompensationOutbox outbox : pendings) {
        try {
            switch (outbox.getType()) {
                case "POINT_RESTORE":
                    pointRestClient.cancelPoints(outbox.getUserId(), outbox.getAmount(), "보상 재시도");
                    outbox.setStatus("COMPLETED");
                    break;
                // CARD_REFUND, STOCK_RESTORE 등...
            }
        } catch (Exception e) {
            outbox.setRetryCount(outbox.getRetryCount() + 1);
            if (outbox.getRetryCount() >= 5) {
                outbox.setStatus("FAILED");  // 운영팀 알림
            }
        }
    }
}
```

**결과:**

```
총 결제:     7,408건
실시간 유실:  854건 (부하 중 타임아웃)
최종 유실:    0건 (Outbox 재시도 후 전부 복구)
```

즉시 완벽하지 않아도, 최종적으로 정합성이 수렴하는 **Eventual Consistency**.

### 4. 문제: DB 비관적 락의 구조적 한계

포인트 동시성은 `SELECT FOR UPDATE`로 해결했다:

```java
// PointService.java
@Transactional  // ← 여기서 DB 커넥션 획득
public Point usePoints(String userId, int amount, String description) {
    Point point = pointRepository.findByUserIdForUpdate(userId);  // SELECT FOR UPDATE
    // 락을 못 잡으면 여기서 대기 — 커넥션은 점유한 채
    point.setAvailablePoints(point.getAvailablePoints() - amount);
    pointHistoryRepository.save(history);
    // COMMIT → 락 해제 → 커넥션 반환
}
```

300 VU 부하 테스트에서 p95 469ms, max 2.26s로 지연이 쌓이기 시작했다. `SELECT FOR UPDATE`의 락은 트랜잭션이 COMMIT할 때 풀리고, `@Transactional` 진입 시 커넥션을 획득하기 때문에 **락을 못 잡아도 커넥션을 반환할 수 없는 구조**다.

### 5. 해결: Redis 분산 락 — 락 대기를 트랜잭션 바깥으로

```java
// RedisLockPointFacade.java — 락 획득 (트랜잭션 바깥)
public Point usePoints(String userId, int amount, String description) {
    RLock lock = redissonClient.getLock("point:lock:" + userId);
    boolean acquired = lock.tryLock(10, 15, TimeUnit.SECONDS);
    // ↑ 락 대기 중에는 DB 커넥션 점유 없음

    return innerService.usePoints(userId, amount, description);
    // ↑ 락 잡은 후에야 @Transactional 시작 → DB 커넥션 획득

    lock.unlock();
}

// RedisLockPointInnerService.java — 별도 Bean으로 분리
@Transactional  // ← 락 획득 후에야 커넥션 획득
public Point usePoints(String userId, int amount, String description) {
    Point point = pointRepository.findByUserId(userId);  // FOR UPDATE 불필요
    point.setAvailablePoints(point.getAvailablePoints() - amount);
    pointHistoryRepository.save(history);
}
```

**별도 Bean으로 분리한 이유:** 같은 클래스 내 메서드 호출은 Spring AOP 프록시가 적용되지 않아 `@Transactional`이 동작하지 않기 때문.

**비교 실험** (point-service 3대 + nginx LB, 300 VU, 2분):

| 지표 | DB 비관적 락 | Redis 분산 락 |
|------|------------|-------------|
| 처리량 | 30,145건 (251 TPS) | **40,580건 (338 TPS)** |
| p95 지연 | 1.09s | **704ms** |
| 성공률 | 100% | 100% |
| 마이너스 잔액 | 0명 | 0명 |

---

## 결제 보안

### HMAC 서명 (위변조 방지)

```java
// HmacService.java
public String sign(String orderId, int amount) {
    String data = orderId + ":" + amount;
    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(secretKey.getBytes(), "HmacSHA256"));
    return hex(mac.doFinal(data.getBytes()));
}
```

클라이언트가 금액을 조작해도 서버에서 `orderId + amount`로 서명을 재생성하여 비교. 불일치 시 거절.

### 멱등성 키

```java
// PaymentService.createPayment()
Optional<Payment> existing = paymentRepository.findByOrderIdAndStatus(orderId, "COMPLETED");
if (existing.isPresent()) {
    return existing.get();  // 이미 처리된 결제 반환
}
```

네트워크 타임아웃으로 클라이언트가 재시도해도 중복 결제 방지.

---

## 사용자 흐름

```
홈 → 검색/카테고리 → 상품 상세 (달성률, 재고, D-day)
                          │
                  바로구매 or 장바구니
                          │
                  결제 (포인트 or 카드)
                          │
                  주문 생성 → 재고 차감 → 실검 반영
                          │
                  실패 시 → SAGA 보상 (카드 환불, 포인트 복구, 재고 복구, 적립 회수)
```

---

## 정리

| 문제 | 원인 | 해결 | 검증 |
|------|------|------|------|
| 분산 환경 포인트 유실 | 서비스 간 트랜잭션 분리 → 부분 실패 | SAGA 보상 | 보상 자체가 실패 → 2차 문제 |
| SAGA 보상이 오히려 악화 | 보상 호출이 커넥션 풀에 추가 부하 | CompensationOutbox 재시도 | 최종 유실 0건 |
| DB 락 커넥션 점유 | `@Transactional` 안에서 락 대기 = 커넥션 반환 불가 | Redis 분산 락 (락 대기를 트랜잭션 바깥으로) | 처리량 34%↑, p95 35%↓ |
| 금액 위변조 | 클라이언트에서 금액 조작 가능 | HMAC-SHA256 서명 검증 | — |
| 네트워크 타임아웃 중복 결제 | 클라이언트 재시도 시 이중 결제 | 멱등성 키 (orderId) | — |

---

## 상세 기술 문서

| 문서 | 내용 |
|------|------|
| [PAYMENT_TROUBLESHOOTING.md](PAYMENT_TROUBLESHOOTING.md) | 결제 시스템 트러블슈팅 (SAGA + 동시성 제어) |
| [LOAD_TEST.md](LOAD_TEST.md) | k6 부하 테스트 (재고/SAGA/포인트/Redis 락 비교) |
| [REALTIME_SEARCH.md](REALTIME_SEARCH.md) | ES + Nori + WebSocket 실시간 검색 구축 |
| [DATABASE_SEPARATION.md](DATABASE_SEPARATION.md) | DB 분리 + Polyglot Persistence |
| [PAYMENT_SECURITY.md](PAYMENT_SECURITY.md) | 결제 보안 설계 (HMAC, 카드 마스킹, DB 접근 권한 분리) |
| [MULTI_INSTANCE.md](MULTI_INSTANCE.md) | K8s 도입과 제거 — 깨달음 |
