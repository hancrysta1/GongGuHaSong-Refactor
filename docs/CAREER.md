# 경력기술서

## 공구하송 — MSA 공동구매 플랫폼 리팩토링 (2025.10 ~ 2026.03, 1인)

> 교내 공구 커뮤니티(모놀리식, MongoDB 단일 DB, 결제 없음)를 쇼핑몰형 공동구매 플랫폼으로 전면 리팩토링.
> 모놀리식 → MSA 6개 서비스 분리, 결제/재고/검색 신규 구축, k6 부하 테스트로 정량 검증.

- **원본**: 2022년 4인 팀 프로젝트 (본인: 백엔드), 숙명여대 SOLUX 27기 우수상
- **공통 기술**: Java 11, Spring Boot 2.7, OpenFeign, MySQL, MongoDB, Redis, Apache Kafka, Docker Compose, k6

---

### 프로젝트 1: SAGA 보상 트랜잭션 + CompensationOutbox

- **설명**: MSA 분산 환경에서 결제 실패 시 포인트가 유실되는 문제를 발견하고, SAGA 보상 트랜잭션 + Outbox 재시도로 최종 유실 0건 달성
- **사용 기술**: Spring Boot, OpenFeign, MySQL, k6 (타임아웃 단축 + 부하로 자연 실패 유도)
- **기여도**: 100%
- **진행 내용**

    payment-service에서 point-service로 Feign 동기 호출로 포인트를 차감한다. 잔액 확인 → 차감 → 결제 진행의 순서 보장이 필요하기 때문이다 (Kafka 비동기로 하면 카드 결제 후에 잔액 부족을 알게 됨). 그런데 MSA에서는 서비스마다 별도 DB를 사용하므로, Feign 호출 시점에 point-service의 트랜잭션이 이미 커밋된다. 이후 payment-service에서 실패해도 point-service의 차감은 되돌릴 수 없다.

| 문제점 | 원인 | 개선 결과 |
| --- | --- | --- |
| 결제 실패 시 포인트 유실 (90.4%) | payment-service와 point-service의 트랜잭션이 분리됨. 포인트 차감 후 결제 저장이 실패하면 point-service의 커밋은 되돌릴 수 없음 | SAGA Orchestration 적용. 실패 시 역순 보상 (카드 환불 → 포인트 복구 → 재고 복구 → 적립 회수) |
| SAGA 보상이 오히려 악화 (90.4% → 97.1%) | 보상 호출이 point-service에 추가 Feign 요청을 발생시킴. 300명 동시 결제 + 보상 동시 발생 시 HikariCP 커넥션 풀 고갈. 보상이 가장 필요한 순간에 보상 자체가 타임아웃 | CompensationOutbox 도입. 보상 실패 시 로컬 DB에 저장, 30초 폴링 스케줄러로 최대 5회 재시도. 부하가 줄어든 후 자동 복구 |

- **주요 성과**
    - 포인트 유실률 90.4% → 최종 유실 0건 (Eventual Consistency)
    - 결제 요청 타임아웃을 3초로 강제 설정 + 300명 동시 부하 환경에서 자연 실패를 유도해 정량 검증
    - "보상을 적용했더니 오히려 악화" → 원인 분석 (커넥션 풀 고갈) → Outbox로 해결하는 과정을 경험

---

### 프로젝트 2: 포인트 동시성 제어 — DB 비관적 락 → Redis 분산 락

- **설명**: DB 비관적 락의 구조적 한계를 부하 테스트에서 발견하고, Redis 분산 락으로 전환하여 처리량 34%↑, p95 35%↓ 달성
- **사용 기술**: MySQL (`SELECT FOR UPDATE`), Redis (Redisson), nginx, k6
- **기여도**: 100%
- **진행 내용**

    포인트 동시성은 `SELECT FOR UPDATE` 비관적 락으로 해결했으나, 300 VU 부하에서 p95 469ms, max 2.26s로 지연이 쌓이기 시작했다. `SELECT FOR UPDATE`의 락은 `@Transactional`이 COMMIT할 때 풀리는데, `@Transactional` 진입 시 DB 커넥션을 획득하므로 락을 못 잡아도 커넥션을 반환할 수 없는 구조다. Redis 분산 락은 `@Transactional` 바깥에서 먼저 락을 획득하고, 락을 잡은 후에야 트랜잭션을 시작하기 때문에 대기 중 커넥션을 점유하지 않는다.

| 문제점 | 원인 | 개선 결과 |
| --- | --- | --- |
| 300 VU 부하에서 timeout 발생 (p95 469ms) | `@Transactional` 진입 시 커넥션 획득 → `SELECT FOR UPDATE` 락 대기 중에도 커넥션 반환 불가. 인스턴스 증가 시 커넥션 풀 경합 심화 | Redis 분산 락(Redisson) 적용. `RedisLockPointFacade`에서 `@Transactional` 바깥에서 락 획득 후, 별도 Bean(`RedisLockPointInnerService`)의 `@Transactional`을 호출. 커넥션은 실제 작업 시에만 사용 |
| 별도 Bean 분리 필요 | 같은 클래스 내 메서드 호출은 Spring AOP 프록시가 적용되지 않아 `@Transactional`이 동작하지 않음 | Facade(락) + InnerService(`@Transactional`) 구조로 분리하여 트랜잭션 정상 동작 보장 |

- **주요 성과**
    - point-service 3대 + nginx LB 환경에서 비교 실험: 처리량 34%↑ (251→338 TPS), p95 35%↓ (1.09s→704ms)
    - 단일 인스턴스 21만 건 동시 적립/차감에서 마이너스 잔액 0건
    - 양쪽 모두 정합성 완벽 (마이너스 잔액 0건). 차이는 성능에서만 발생

---

### 프로젝트 3: 재고 동시성 + MongoDB → MySQL 전환

- **설명**: 재고 초과 판매 문제를 원자적 차감으로 해결하고, 금전 도메인의 다중 문서 원자성 한계를 발견하여 MySQL로 전환
- **사용 기술**: MongoDB (`findAndModify`), MySQL (`@Transactional`, `SELECT FOR UPDATE`), k6
- **기여도**: 100%
- **진행 내용**

    재고 동시성과 포인트 정합성, 두 가지 문제를 순차적으로 해결하는 과정에서 MongoDB의 한계를 발견하고 금전 도메인을 MySQL로 전환하는 판단까지 이어졌다.

| 문제점 | 원인 | 개선 결과 |
| --- | --- | --- |
| 재고 초과 판매 (300명 → 300건 전부 성공) | 조회-체크-차감이 분리된 구조. 300명이 동시에 `stock=100`을 읽고 전부 재고 체크를 통과 | MongoDB `findAndModify`로 조회+차감을 원자적으로 처리. 10,000명 동시 주문에서 정확히 100건만 성공 |
| 포인트 차감-이력 간 누락 | MongoDB에서 차감과 이력 저장이 별도 연산. 중간 실패 시 차감만 되고 이력 누락 | 금전 도메인을 MySQL로 전환. `@Transactional`로 차감+이력을 하나의 트랜잭션으로 묶어 원자성 보장 |
| 동시 적립/차감 시 마이너스 잔액 | MongoDB `findAndModify`는 단일 문서 원자성만 보장. point + point_history 다중 문서 간 원자성 미보장 | MySQL `SELECT FOR UPDATE` 비관적 락 적용. 21만 건 동시 요청에서 마이너스 잔액 0건 |

- **주요 성과**
    - 재고: 300명 → 3,000명 → 10,000명 동시 주문에서 초과 판매 0건
    - 포인트: 21만 건 동시 적립/차감에서 마이너스 잔액 0건, 차감-이력 누락 0건
    - NoSQL vs RDBMS 판단 근거를 직접 경험: 금전 도메인은 ACID 보장이 필수 → Polyglot Persistence (MongoDB + MySQL + ES)

---

### 프로젝트 4: 실시간 검색 랭킹

- **설명**: Elasticsearch + Nori 한국어 형태소 분석 기반 검색 엔진과, Kafka 이벤트 드리븐 실시간 랭킹 시스템 구축
- **사용 기술**: Elasticsearch 7.17 (Nori), Apache Kafka, Redis, WebSocket (STOMP), MongoDB
- **기여도**: 100%
- **진행 내용**

    검색 기능이 없던 원본에 한국어 검색 + 실시간 랭킹을 신규 구축했다. 랭킹 갱신을 폴링(10초)에서 이벤트 드리븐(즉시)으로 전환하고, 자동완성 API가 랭킹을 오염시키는 문제를 발견하여 분리했다.

| 문제점 | 원인 | 개선 결과 |
| --- | --- | --- |
| 랭킹 갱신 지연 (최대 10초) | `@Scheduled(fixedRate=10000)` 서버 사이드 폴링. 데이터 변화 없어도 불필요한 DB 조회 발생 | 주문 시 Kafka → 즉시 랭킹 재계산 + WebSocket push. 60초 폴링은 검색 로그 등 Kafka를 거치지 않는 변동분 보정용 폴백으로 유지 |
| 자동완성이 랭킹을 오염 | 자동완성 API와 실제 검색 API가 같은 로그를 저장. 타이핑 중간 결과가 검색 횟수에 반영됨 | `/suggest`(자동완성)는 ES 조회만, `/search`(실제 검색)만 로그 저장하도록 API 분리 |

- **주요 성과**
    - 랭킹 점수 = 검색횟수 × 0.4 + 주문량 × 0.6 (최근 1시간)
    - 이벤트 드리븐(즉시 갱신) + 60초 폴링(폴백) 하이브리드 구조
    - Redis 캐시 + WebSocket push로 클라이언트 즉시 반영

---

### 프로젝트 5: 결제 보안 설계

- **설명**: 실제 PG사 연동 구조를 차용하여 결제 응답 위변조 방지, 클라이언트 금액 조작 방지, 중복 결제 방지를 위한 보안 설계
- **사용 기술**: HMAC-SHA256, MySQL, Spring Boot
- **기여도**: 100%
- **진행 내용**

    결제 시스템에서 세 가지 보안 위협을 식별하고 각각에 대한 방어 로직을 설계했다. PG 응답 검증은 실제 PG사(토스페이먼츠 등)가 웹훅에 HMAC 서명을 붙여 보내는 구조를 차용하여, Mock PG(CardService)가 결제 승인 응답에 승인번호 + 금액 기반 HMAC 서명을 포함하고 PaymentService에서 동일 secretKey로 서명을 재생성하여 검증하는 방식으로 구현했다.

| 문제점 | 원인 | 개선 결과 |
| --- | --- | --- |
| PG 응답 위변조 가능성 | 외부에서 가짜 결제 완료 응답을 보내거나, PG 응답이 중간에 변조될 수 있음. HTTPS는 네트워크 구간만 보호하므로 발신자 자체를 검증하지 않음 | PG사 구조 차용 — CardService(Mock PG)가 결제 응답에 HMAC-SHA256 서명(`approvalNumber + amount`)을 포함하여 반환. PaymentService가 동일 secretKey로 서명을 재생성하여 비교, 불일치 시 거절 |
| 네트워크 타임아웃 시 중복 결제 | 클라이언트가 응답을 못 받고 재시도하면 동일 결제가 이중 처리 | 멱등성 키(orderId) 도입. Payment 테이블에 orderId를 저장하고, `findByOrderIdAndStatus(orderId, "COMPLETED")`로 이미 처리된 결제는 기존 결과를 반환 |

- **주요 성과**
    - PG사 연동 구조 차용 — HMAC-SHA256 서명으로 결제 응답의 발신자 + 무결성 검증
    - 멱등성 키로 중복 결제 방지 — 네트워크 불안정 환경에서도 안전
