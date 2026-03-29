# 공구하송 — 공동구매 플랫폼

> 개인사업자 중심의 파편화된 공동구매를 플랫폼화하여, 누구나 실시간으로 여러 공구에 참여할 수 있는 대국민 서비스

---

## 프로젝트 배경

### 왜 이 프로젝트를 시작했는가

이전에 급여 정산 서비스를 개발하면서 MSA 구조를 적용하려 했지만, 운영에 필요한 것만 추리다 보니 인스턴스를 여러 개 띄우거나 서비스별로 다른 DB를 쓰는 것에 한계가 있었다. 비용과 현실성을 고려하면 당연한 판단이었지만, MSA 구조를 제대로 활용해본 경험이 없다는 게 아쉬웠다.

그래서 기존에 교내에서 진행했던 공동구매 웹사이트를 리팩토링하기로 했다.

### 무엇이 바뀌었는가

| | Before (교내 프로젝트) | After (리팩토링) |
|---|---|---|
| 컨셉 | 교내 공동구매 참여 사이트 (폐쇄적) | 누구나 참여하는 공구 플랫폼 (대국민 서비스) |
| 아키텍처 | 모놀리식 Spring Boot | MSA 6개 서비스 + Docker Compose |
| 기능 | 공구 참여, 쪽지 | + 장바구니, 포인트/카드 결제, 수량 관리, 실시간 검색어 |
| DB | MongoDB 단일 | MongoDB + MySQL + Elasticsearch (Polyglot Persistence) |
| 통신 | HTTP 직접 호출 | REST + Kafka 이벤트 + WebSocket 실시간 |

얼마 전 대용량 트래픽 강의를 수료하고, Elasticsearch를 활용한 검색 기능과 부하 테스트에도 끄떡없는 트래픽 설계를 꼭 직접 경험해보고 싶었다. 물론 프론트엔드를 포함해 AI의 도움도 적극적으로 받았다. 백엔드 설계와 문제 해결에 집중하기 위해서다. AI를 쓰면 설정 자체는 빠르게 끝나지만, "왜 안 되지?"에 대한 판단력과 인프라가 바뀌었을 때 코드가 달라지는 감각은 직접 삽질해봐야 생긴다는 걸 이번 프로젝트에서 체감했다. (자세한 내용: [MULTI_INSTANCE.md](MULTI_INSTANCE.md))

### 서비스가 왜 이렇게 많은가 — 도메인 분리 기준

6개 서비스가 많다고 느낄 수 있다. 분리 기준은 "이 데이터를 누가 소유하고, 독립적으로 변경/배포할 수 있는가"였다.

```
도메인 판별 기준.
1. 데이터 소유권 — 이 데이터는 어떤 비즈니스 맥락에 속하는가?
2. 변경 빈도 — 이 기능이 바뀔 때 다른 기능에 영향을 주는가?
3. 확장 필요성 — 트래픽 특성이 다른가? (검색은 읽기 집중, 결제는 쓰기 집중)
4. 기술 선택 — 다른 DB나 기술 스택이 더 적합한가?
```

| 서비스 | 소유 데이터 | 분리 근거 |
|--------|-----------|----------|
| member | 회원 정보, 인증 | 인증은 모든 서비스의 기반이지만 변경이 드물고 독립적 |
| product | 상품(공구) 정보 | 카테고리별 스키마가 다름 → MongoDB 유연한 스키마 필요 |
| order | 주문, 주문 상태 | 주문은 상태 전이가 복잡 (PENDING→CONFIRMED→CANCELLED), 이벤트 발행 주체 |
| payment | 결제 기록, 카드 | 금전 도메인 → ACID 필수, MySQL 전환. SAGA 오케스트레이터 역할 |
| point | 포인트 잔액, 이력 | 금전 도메인 → 동시성 제어 필수, MySQL `SELECT FOR UPDATE` |
| search | 검색 인덱스, 랭킹 | 기술 자체가 다름 — Elasticsearch + Nori. 다른 서비스와 기술 스택이 완전히 다름 |

"point와 payment를 왜 나눴는가?" — 이 둘은 겉보기에 "결제"라는 하나의 도메인으로 묶일 수 있다. 하지만 실제 흐름을 보면 통신 패턴이 완전히 다르다.

```
[포인트 적립] 주문 확정 → Kafka "order-events" → point-service (비동기)
  → 실패해도 나중에 재처리 가능 (eventual consistency)

[포인트 차감] 결제 요청 → payment-service → REST → point-service (동기)
  → 잔액 검증 후 즉시 차감, 실패 시 결제 자체를 중단해야 함
```

비동기(적립)와 동기(차감)가 같은 서비스 안에 있으면, Kafka consumer와 REST controller가 같은 포인트 잔액을 동시에 건드리는 구조가 된다. 분리하면 point-service는 포인트 데이터만 책임지고, payment-service는 결제 흐름(SAGA)만 책임진다.

그리고 SAGA 보상 트랜잭션 관점에서도 분리가 자연스럽다. 결제가 실패하면 payment-service가 point-service에 "포인트 복구해줘"를 요청한다. 만약 둘이 같은 서비스라면, "결제 실패 → 자기 자신에게 포인트 복구 요청"이 되는데, 이건 보상 트랜잭션이 아니라 그냥 내부 롤백이다. 서비스가 분리되어 있어야 "서비스 A가 실패했을 때 서비스 B의 상태를 되돌린다"는 SAGA의 본래 구조가 성립한다.

### 왜 Zookeeper인가

이전 프로젝트에서는 Spring Cloud Gateway + Eureka만으로 서비스 디스커버리를 처리했다. 이번에도 Eureka를 사용하지만, Kafka의 브로커 코디네이션을 위해 Zookeeper를 추가했다.

Zookeeper의 역할.
- Kafka 브로커 관리: 브로커 등록, 리더 선출, 파티션 할당
- 분산 코디네이션: 여러 브로커/인스턴스가 있을 때 합의(consensus) 담당

현재는 Kafka 브로커 1대 + Zookeeper 1대지만, 향후 서비스 인스턴스를 여러 개 띄워서 Kafka 파티션이 제대로 분배되는지, Zookeeper가 브로커 장애 시 리더를 재선출하는지 테스트해볼 계획이다.

### DB를 왜 다르게 했는가

처음에는 전 서비스 MongoDB로 통일했다. 서비스별 독립 DB 분리가 목적이었고, Document 모델이 MSA에 유연하다고 판단했다.

그런데 동시성 문제를 해결하면서 금전 도메인에 MongoDB가 맞지 않다는 걸 체감했다.
- `findAndModify`로 차감은 원자적이지만, 이력 저장은 별도 연산
- MongoDB multi-document 트랜잭션은 Replica Set 필수 + 공식 문서도 "가능하면 쓰지 마라"
- 금전 도메인은 매 연산마다 트랜잭션이 필수 → RDBMS의 설계 철학과 부합

그래서 point-service와 payment-service를 MySQL로 리팩토링했다. `@Transactional` + `SELECT FOR UPDATE`로 차감+이력이 하나의 트랜잭션에 묶이고, ACID 4속성 전부 테스트로 검증했다.

이 과정에서 "기술에 문제를 맞추지 말고, 문제에 기술을 맞춰야 한다"는 걸 체감했고, 이게 결국 MSA에서 Polyglot Persistence가 가능한 이유이자 MSA의 진짜 가치라는 걸 깨달았다. (자세한 내용: [PAYMENT_TROUBLESHOOTING.md](PAYMENT_TROUBLESHOOTING.md) 깨달음 참고)

---

## 아키텍처

```
 ┌──────────┐          ┌──────────────┐          ┌──────────┐
 │ Browser  │── REST ─→│  API Gateway │←─ REST ──│ Frontend │
 │          │←─ WS ────│   :8080      │          │ (React)  │
 └──────────┘          └──────┬───────┘          └──────────┘
                              │ REST (Eureka 서비스 디스커버리)
            ┌─────────────────┼─────────────────┐
            │                 │                 │
       ┌────▼────┐      ┌────▼────┐      ┌─────▼─────┐
       │ Member  │      │ Product │      │  Search   │
       │ :8081   │      │ :8082   │      │  :8086    │
       │         │      │         │      │           │
       │ MongoDB │      │ MongoDB │      │ ES + Nori │
       └─────────┘      │ + Redis │      │ + MongoDB │
                        └────┬────┘      └─────▲─────┘
                             │                 │
                        Kafka: product-events   │
                             │                 │
       ┌─────────────────────┼─────────────────┘
       │                     │
  ┌────▼────┐          ┌─────▼─────┐
  │  Order  │──Kafka──→│  Payment  │
  │  :8083  │ order-   │  :8085    │
  │         │ events   │  (SAGA)   │
  │ MongoDB │    │     │  MySQL    │ ← 금전 도메인 = RDBMS
  └────┬────┘    │     └─────┬─────┘
       │         │           │ REST (동기: 잔액 검증)
       │    ┌────▼────┐      │
       │    │  Point  │◄─────┘
       │    │  :8084  │
       │    │         │
       │    │  MySQL  │ ← Polyglot Persistence
       │    │ + Redis │   (금전 도메인 = RDBMS)
       │    └─────────┘
       │
       └──── WebSocket ──→ 브라우저 (주문 알림, 실시간 랭킹)
```

### 데이터 흐름 예시: 결제

```
① 사용자 결제 요청
   Browser → API Gateway → Order Service

② 주문 생성 + 재고 차감
   Order Service → Feign(REST) → Product Service (stock -= quantity)

③ 이벤트 팬아웃 (비동기)
   Order Service → Kafka "order-events" → Payment (재고 예약)
                                        → Point (포인트 적립)
                                        → Search (랭킹 갱신 + WebSocket push)

④ 결제 처리 (SAGA Orchestration)
   Payment Service → REST → Point Service (포인트 차감, MySQL SELECT FOR UPDATE)
                   → CardService (카드 결제)
                   → MySQL (결제 기록 저장, @Transactional)
                   ※ 실패 시 역순 보상: 카드 환불 → 포인트 복구 → 재고 복구 → 적립 포인트 회수
```

### 서비스 간 통신 패턴

| 구간 | 프로토콜 | 왜 이 방식인가 |
|------|----------|--------------|
| 브라우저 → API Gateway | REST | 브라우저가 지원하는 표준 프로토콜 |
| order → product (재고 차감) | Feign (REST) | 동기 필수 (재고 부족 시 즉시 거절) |
| order → payment/point/search | Kafka (비동기) | 1건 주문 → 3개 서비스에 팬아웃, 느슨한 결합 |
| payment → point (포인트 차감) | REST (동기) | 잔액 검증 → 차감 순서 보장 필수 |
| search → 브라우저 (실검) | WebSocket (STOMP) | 서버 → 클라이언트 실시간 push |

> 통신 패턴 선택 과정에서 gRPC 도입 후 제거한 경험이 있다. 동시 50명 부하 테스트에서 REST 대비 성능 차이가 없었고, MongoDB I/O가 병목이라 네트워크 프로토콜 최적화가 무의미했다.

### MongoDB를 왜 선택했고, 어디까지 활용했는가

초기에 전 서비스 MongoDB로 통일한 이유는 서비스별 독립 DB 분리가 목적이었고, Document 모델이 서비스마다 스키마가 다른 MSA 구조에 유연하다고 판단했다.

현재 활용하고 있는 MongoDB 특성.

| MongoDB 특성 | 활용 여부 | 적용 위치 |
|-------------|:---------:|----------|
| Document-level 원자성 | ✅ | `findAndModify` + `$inc` 로 포인트 동시성 제어 |
| 유연한 스키마 | ✅ | 상품(Sell) 카테고리별 다른 옵션 필드 허용 |
| 임베디드 문서 | ❌ | 주문에 상품 스냅샷 내장 시 조인 없이 조회 가능 (개선 가능) |
| Aggregation Pipeline | ❌ | 랭킹 집계를 MongoDB에서 직접 처리 가능 (현재는 Java에서 계산) |
| Change Streams | ❌ | DB 변경 감지 → 이벤트 발행 (Kafka 보완 가능) |

### NoSQL은 왜 생겼고, MongoDB는 어디에 적합한가

NoSQL은 2000년대 후반, 기존 RDBMS가 처리하기 어려운 문제를 해결하기 위해 등장했다.

- 대규모 비정형 데이터: SNS 피드, IoT 센서 로그, 사용자 행동 데이터 등 스키마가 고정되지 않은 데이터
- 수평 확장(Scale-out): RDBMS의 수직 확장(Scale-up) 한계를 넘어, 여러 노드에 데이터를 분산
- 유연한 스키마: 서비스가 빠르게 변하는 스타트업 환경에서, 매번 ALTER TABLE 없이 필드 추가/변경

MongoDB는 그중에서도 Document 모델 기반 NoSQL이다. JSON과 유사한 BSON 형태로 데이터를 저장하며, 핵심 설계 철학은.

> *"Data that is accessed together should be stored together."*
> — MongoDB 공식 문서

실제로 MongoDB가 많이 쓰이는 곳.

| 도메인 | 이유 | 대표 사례 |
|--------|------|----------|
| 상품 카탈로그 | 카테고리별 속성이 다름 (의류 → 사이즈, 전자제품 → 스펙) | eBay, 쿠팡 상품 |
| 사용자 프로필 | 유저마다 설정, 선호도 구조가 다름 | Forbes, Adobe |
| 실시간 로그/분석 | 대량 쓰기, 스키마 변동 잦음 | CERN, Bosch IoT |
| 콘텐츠 관리(CMS) | 글, 이미지, 메타데이터 구조가 유동적 | The Guardian |

공통점: 스키마가 유동적이고, 조인보다 단일 document 조회가 많고, 정합성보다 유연성/확장성이 중요한 도메인.

### 그래서 금전 도메인에는 왜 안 맞는가

동시성 문제를 해결하면서 point/payment 서비스는 RDBMS가 더 적합하다는 걸 체감했다.

1. MongoDB 트랜잭션 — "가능은 하지만 자연스럽지 않다"

MongoDB 4.0부터 multi-document 트랜잭션을 지원한다. Spring Data MongoDB에서도 `@Transactional`을 쓸 수 있다. 불가능한 게 아니다.

하지만 조건이 있다.

| | MySQL | MongoDB Transaction |
|---|---|---|
| 트랜잭션 | 태생부터 핵심 기능 | 4.0에서 추가 (2018, 후발 기능) |
| 필요 조건 | 없음 (기본) | Replica Set 필수 (standalone 불가) |
| 공식 입장 | "트랜잭션 안에서 하라" | "가능하면 트랜잭션 없이 해결하라" |
| `SELECT FOR UPDATE` | ✅ 네이티브 비관적 락 | ❌ 없음 |
| 설계 철학 | 정합성 우선 (ACID) | 유연성/확장성 우선 (BASE) |

MongoDB 공식 문서.

> *"In most cases, a distributed transaction incurs a greater performance cost over single document writes, and the availability of distributed transactions should not be a replacement for effective schema design."*
> — [MongoDB Manual: Transactions](https://www.mongodb.com/docs/manual/core/transactions/)

즉 "트랜잭션은 비용이 크니, 스키마 설계로 해결하라"가 MongoDB의 공식 입장이다. 금전 도메인처럼 매 연산마다 트랜잭션이 필수인 경우, MongoDB의 설계 철학과 맞지 않는다.

2. 비관적 락 — 금전 동시성의 정석

금전 차감에서 가장 확실한 동시성 제어는 `SELECT FOR UPDATE`(비관적 락)이다.

```sql
-- MySQL: 한 트랜잭션 안에서 잔액 검증 + 차감 + 이력이 원자적
BEGIN;
  SELECT available_points FROM point WHERE user_id = ? FOR UPDATE;  -- 행 잠금
  UPDATE point SET available_points = available_points - ?;
  INSERT INTO point_history (user_id, amount, type) VALUES (?, ?, 'USE');
COMMIT;  -- 전부 성공 or 전부 롤백
```

MongoDB에는 `SELECT FOR UPDATE`가 없다. 대신 `findAndModify`로 단일 document 내 원자적 연산은 가능하지만, 차감(Point 컬렉션)과 이력(PointHistory 컬렉션)이 별도 컬렉션이라 하나의 원자적 연산으로 묶을 수 없다.

실제 프로젝트에서도.
- MongoDB `findAndModify`로 포인트 차감 동시성은 해결함 ✅
- 하지만 차감 + 이력 저장이 별도 연산 → multi-document 트랜잭션 또는 Replica Set 필요
- 현재 Docker에서 standalone 구성 → 트랜잭션 사용 불가

3. 업계 관행 — 금전은 RDBMS

토스, 카카오페이, 배달의민족 등 국내 핀테크/커머스에서 결제/포인트 도메인은 거의 예외 없이 RDBMS를 사용한다.

- 금전 데이터는 감사 추적(Audit Trail) 필수 → RDBMS의 WAL(Write-Ahead Log)이 적합
- 정산/회계 시스템 연동 → SQL 기반 리포팅이 표준
- 규제 요건 → 데이터 정합성 증명이 RDBMS에서 용이
- NHN, 우아한형제들 기술블로그에서도 "결제는 MySQL/PostgreSQL" 사례 다수

4. 전환의 근거 — "불가능해서"가 아니라 "더 적합해서"

MongoDB 트랜잭션으로도 해결할 수 있었다. 하지만.
- Replica Set 구성이 필요하고 (인프라 복잡도 증가)
- 매 연산마다 트랜잭션을 쓰는 건 MongoDB의 설계 철학에 반하고
- `SELECT FOR UPDATE` 같은 네이티브 비관적 락이 없어서 동시성 제어가 우회적이고
- 금전 도메인에서 RDBMS를 쓰는 건 업계 표준이다.

그래서 point-service를 MySQL로 리팩토링했다. 전환 후 `@Transactional` + `SELECT FOR UPDATE`로 차감+이력이 하나의 트랜잭션에 묶이고, 동시성 테스트에서 차감 5건 = 이력 5건 100% 일치를 확인했다.

### Polyglot Persistence — 서비스 특성에 맞는 DB 선택

| 서비스 | DB | 선택 근거 |
|--------|-----|----------|
| product | MongoDB | 의류(사이즈), 문구(색상), 뱃지(재질) 등 카테고리별 스키마가 다름. MongoDB의 유연한 스키마가 본질에 부합 |
| search | ES + MongoDB | 전문 검색은 ES(Nori 한국어 형태소 분석), 검색/주문 로그는 MongoDB(비정형, 대량 쓰기) |
| member | MongoDB → MySQL 검토 | 회원 정보는 스키마 고정. 현재는 MongoDB로 충분하지만 규모가 커지면 관계형이 자연스러움 |
| order | MongoDB → MySQL 검토 | 주문 상태 전이(PENDING→CONFIRMED→CANCELLED)의 정합성이 중요. 트랜잭션 보호 필요 |
| point | MySQL (전환 완료) | 금전 데이터. `@Transactional` + `SELECT FOR UPDATE`로 차감+이력 원자적 처리 |
| payment | MySQL (전환 완료) | 결제 기록, 감사 추적, 정산 리포팅. `@Transactional`로 SAGA 보상 + 결제 기록 원자적 처리 |

---

## 기술 스택과 선택 근거

| 기술 | 역할 | 왜 이걸 선택했는가 |
|------|------|-------------------|
| Spring Boot 2.7 | 백엔드 프레임워크 | Spring Cloud 생태계 (Eureka, Gateway, Feign) |
| MongoDB | 상품, 주문, 검색 로그 등 | 스키마 유연성 필요한 도메인. Document 모델 적합 |
| MySQL | 포인트 (금전 도메인) | `@Transactional` + `SELECT FOR UPDATE` 네이티브 지원. 차감+이력 원자적 처리 |
| Apache Kafka | 이벤트 브로커 | 주문 이벤트를 결제/포인트/검색 3개 서비스에 팬아웃 |
| Elasticsearch + Nori | 검색 엔진 | 한국어 형태소 분석 기반 실시간 상품 검색 |
| Redis | 캐시 | 상품 캐시, 랭킹 캐시, 포인트 캐시 (다중 인스턴스 대응) |
| WebSocket (STOMP) | 실시간 통신 | 실시간 검색 랭킹 push (polling 대비 트래픽 절감) |
| Docker Compose | 배포 | 6개 서비스 + 인프라 통합 배포 |
| k6 | 부하 테스트 | Chaos Engineering 기반 정합성 검증 |
| React | 프론트엔드 | AI 도구 활용하여 개발 (백엔드 집중) |

---

## 핵심 기능

### 결제 흐름 (SAGA 패턴)

```
사용자 → 장바구니 → 결제하기
                      │
         ┌────────────▼────────────┐
         │  STEP 1: 주문 생성       │ → order-service
         │  (재고 차감 + Kafka 이벤트)│
         └────────────┬────────────┘
                      │
         ┌────────────▼────────────┐
         │  STEP 2: 포인트 차감     │ → point-service (MySQL)
         │  (SELECT FOR UPDATE)     │
         └────────────┬────────────┘
                      │
         ┌────────────▼────────────┐
         │  STEP 3: 카드 결제       │ → payment-service 내부
         └────────────┬────────────┘
                      │
         ┌────────────▼────────────┐
         │  STEP 4: 결제 기록 저장  │ → MySQL (payment-service)
         └────────────┬────────────┘
                      │
              실패 시 역순 보상
         (카드 환불 → 포인트 복구 → 재고 복구 → 적립 회수)
```

### 실시간 검색 랭킹

- 검색/주문 이벤트 발생 → 즉시 랭킹 재계산 → WebSocket push
- 점수 = 검색횟수 × 0.4 + 주문량 × 0.6 (최근 1시간 기준)
- 상위 10개 키워드, UP/DOWN/NEW 변동 표시

---

## 기술 문서

이 프로젝트에서 겪은 기술적 문제와 해결 과정, 설계 판단을 상세히 기록했다.

### 분산 트랜잭션 & 동시성 & DB 전환 — [PAYMENT_TROUBLESHOOTING.md](PAYMENT_TROUBLESHOOTING.md)

결제 도메인에서 겪은 세 가지 문제를 순차적으로 해결한 과정.

1. 분산 트랜잭션 (SAGA): 결제 실패 시 포인트 유실 → Chaos Engineering(장애 주입 10%)으로 7,263건 중 656건 유실 확인 (90.4%) → SAGA + CompensationOutbox 적용 → 최종 유실 0건 (100% 복구)
2. 동시성 제어: SAGA 적용 후 남은 18건 추적 → Lost Update/Overdraft 발견 → MongoDB `findAndModify`로 1차 해결 → 마이너스 잔액 0건
3. MongoDB → MySQL 리팩토링: `findAndModify`로 차감은 안전하지만 이력과 별도 연산 → MongoDB 트랜잭션 검토 → 금전 도메인 특성상 RDBMS가 적합 → MySQL `@Transactional` + `SELECT FOR UPDATE` → 차감=이력 100% 일치, ACID 4속성 전부 검증

### 실시간 검색어 랭킹 — [REALTIME_SEARCH.md](REALTIME_SEARCH.md)

검색 시스템 구축 전 과정.

1. Elasticsearch + Nori: 한국어 형태소 분석, 역인덱스(Inverted Index) 기반 검색. 띄어쓰기 검색 500 에러 → `contains()` → `matches()` 전환
2. 상품 등록 → ES 자동 인덱싱: Kafka `product-events`로 product-service → search-service 연동
3. 실시간 랭킹: 이벤트 드리븐(즉시) + 60초 폴링(폴백) 하이브리드. WebSocket(STOMP + SockJS)으로 전체 접속자에게 push
4. 검색 분리: 자동완성(`/suggest`, 로그 없음)과 실제 검색(`/search`, 로그+랭킹 반영) 분리 — 오타/미완성 입력이 랭킹 오염 방지
5. 랭킹 동점 불안정: 다단계 정렬(점수 → 검색횟수 → 사전순)로 해결

### 결제 보안 설계 — [PAYMENT_SECURITY.md](PAYMENT_SECURITY.md)

- PG사 미연동 상태에서의 보안 설계 판단 (Mock vs Production 구분)
- 카드 정보 관리: 마스킹(`---1234`), BIN 기반 카드사 식별
- 금액 서버 재계산, 카드 한도 검증, SAGA 보상으로 금전 안전성 확보
- 금전 도메인 MySQL 전환 후 ACID 보장

### DB 분리 전략 & Polyglot Persistence — [DATABASE_SEPARATION.md](DATABASE_SEPARATION.md)

- 단일 MongoDB → Database per Service → Polyglot Persistence까지의 진화
- 금전 도메인(point, payment): MongoDB → MySQL 리팩토링 근거
- NoSQL이 적합한 곳(상품 카탈로그, 검색 로그)과 RDBMS가 필수인 곳(금전) 구분

### 아키텍처 설계 — [ARCHITECTURE.md](ARCHITECTURE.md)

- 모놀리식 → MSA 전환, 서비스 분리 기준
- 통신 패턴 선택: REST(동기) vs Kafka(비동기 팬아웃) vs WebSocket(실시간 push)
- gRPC 도입 후 부하 테스트에서 차이 없어 제거한 경험
- 구현 완료 항목 / 향후 개선 방향 구분

### Docker 배포 트러블슈팅 — [TROUBLESHOOTING.md](TROUBLESHOOTING.md) / [TROUBLESHOOTING2.md](TROUBLESHOOTING2.md)

- Docker Compose 6개 서비스 + 인프라 통합 배포 (MongoDB, MySQL, ES, Redis, Kafka, Zookeeper)
- Nginx DNS 동적 해석, WebSocket 프록시, API Gateway WS 라우팅
- Eureka 등록 지연, ES 기동 순서, Kafka 세션 충돌 해결
- 띄어쓰기 검색 에러, 검색 로그 오염, 랭킹 불안정 해결

### Kubernetes 도입과 제거 — 깨달음 — [MULTI_INSTANCE.md](MULTI_INSTANCE.md)

- 대용량 트래픽 대응을 위해 K8s를 도입했으나, 단일 노드 환경에서는 핵심 가치(self-healing, HPA)가 성립하지 않음을 인지
- 피상적 도입보다 확실한 필요에 의한 선택이라는 판단으로 제거
- 과정에서 Eureka 제거, 인프라에 따른 코드 동작 차이(HTTP Keep-Alive + kube-proxy 고착) 등을 학습

---

## 데이터 모델 (서비스별)

| 서비스 | DB | 주요 컬렉션 | 핵심 필드 |
|--------|-----|------------|----------|
| member-service | member-db | member | pid, pw, name, birth |
| product-service | product-db | sell | title, price, stock, min_count, category |
| order-service | order-db | order | title, userId, total_Count, status |
| payment-service | payment_db (MySQL) | payment, cards, stock_reservation | orderId, pointUsed, cardAmount, status (`@Transactional`) |
| point-service | point_db (MySQL) | point, point_history | userId, availablePoints, version (`SELECT FOR UPDATE`) |
| search-service | search-db + ES | search_log, order_record, ES:products | keyword, score, rank |

---

## 성과 수치

| 항목 | 수치 |
|------|------|
| 부하 테스트 규모 | 동시 300명 + 장애 주입 10% |
| SAGA 도입 효과 | 포인트 유실률 90.4% → 0% (SAGA + Outbox) |
| 동시성 제어 | 마이너스 잔액 0건, 이중 차감 0건, 차감=이력 100% 일치 |
| DB 리팩토링 | point/payment-service MongoDB → MySQL 전환 (Polyglot Persistence) |
| 정상 상황 성공률 | 99.71% (장애 없이 동시 300명) |
| 인프라 정리 | Eureka + API Gateway 제거 (Docker Compose 서비스명 호출로 대체) |

### MySQL 전환 후 ACID 검증

MongoDB → MySQL 리팩토링 후, 금전 도메인에서 ACID 속성이 제대로 보장되는지 실제 테스트로 검증했다.

#### Atomicity (원자성)

> 트랜잭션 내 연산이 전부 성공하거나 전부 실패해야 한다.

```java
// PointService.usePoints() — @Transactional로 묶임
@Transactional
public Point usePoints(String userId, int amount, String description) {
    Point point = pointRepository.findByUserIdForUpdate(userId)  // SELECT FOR UPDATE
        .orElseThrow(...);
    if (point.getAvailablePoints() < amount) throw ...;          // 잔액 부족 → 예외
    point.setAvailablePoints(point.getAvailablePoints() - amount); // UPDATE
    pointHistoryRepository.save(history);                          // INSERT
    // → 예외 발생 시 UPDATE + INSERT 전부 롤백
}
```

테스트: 잔액 500P 상태에서 600P 결제 시도

```
Before: 500P
결제 시도 (600P): HTTP 500 (잔액 부족)
After:  500P (변동 없음)
이력:   0건 (차감 안 됐으니 이력도 생성 안 됨)
✅ 실패 시 차감도 이력도 전부 롤백됨
```

MongoDB였을 때: `findAndModify`(차감)와 `save`(이력)가 별도 연산이라, 차감 성공 후 이력 저장에서 실패하면 불일치 가능.
MySQL에서는: `@Transactional` 안에서 하나라도 실패하면 전부 롤백.

#### Consistency (일관성)

> 트랜잭션 전후로 데이터가 유효한 상태를 유지해야 한다.

테스트: 잔액 500P, 100P x 10건 순차 결제

```
Before: 500P
성공: 5건, 실패: 5건 (잔액 부족)
After:  0P
Expected: 0P (500 - 5×100)
✅ 일관성 유지 — 잔액이 정확히 맞음
```

5건 성공 × 100P = 500P 차감. 나머지 5건은 잔액 부족으로 거절. 중간에 잔액이 마이너스로 빠지거나 차감이 누락된 건 없음.

#### Isolation (격리성)

> 동시에 실행되는 트랜잭션이 서로 간섭하지 않아야 한다.

```java
// SELECT FOR UPDATE가 격리성을 보장
@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query("SELECT p FROM Point p WHERE p.userId = :userId")
Optional<Point> findByUserIdForUpdate(@Param("userId") String userId);
```

테스트: 잔액 300P, 100P x 10건 동시 요청

```
동시 10건 결제 요청
After: 0P
✅ 마이너스 잔액 없음 — 정확히 3건만 성공
```

`SELECT FOR UPDATE`가 행에 배타 락을 걸어서, 동시에 같은 유저의 포인트를 읽으려는 다른 트랜잭션은 락이 풀릴 때까지 대기한다. 덕분에 Read-Check-Write race condition이 원천 차단됨.

MongoDB `findAndModify`도 document-level lock으로 격리성은 보장했지만, 차감과 이력이 별도 연산이라 두 연산 사이의 격리는 보장 안 됨. MySQL은 `@Transactional` + `FOR UPDATE`로 차감+이력 전체가 격리됨.

#### Durability (지속성)

> 커밋된 트랜잭션의 결과는 영구적으로 보존되어야 한다.

```
결제 기록: MySQL payment 테이블에 영구 저장
✅ 서버 재시작해도 데이터 유지 (MySQL InnoDB WAL)
```

MySQL InnoDB는 WAL(Write-Ahead Log)을 사용하여, 커밋된 데이터는 서버가 비정상 종료되어도 복구된다. MongoDB의 WiredTiger도 journal로 지속성을 보장하지만, MySQL의 WAL은 금융 시스템에서 검증된 표준이다.

---

## 실행 방법

### Docker Compose
```bash
docker compose up -d
cd src/frontend && npm start
# → http://localhost:3000
```

---

## Kubernetes 도입과 제거 — [MULTI_INSTANCE.md](MULTI_INSTANCE.md)

대용량 트래픽 대응을 위해 K8s를 도입했으나, 단일 노드 환경에서는 핵심 가치가 성립하지 않아 제거했다. 과정에서 Eureka 제거, HTTP Keep-Alive 분배 문제 등을 경험하고 학습한 내용을 정리했다.

---

## 향후 개선 방향

- Circuit Breaker: 서비스 장애 시 빠른 실패 (Resilience4j)
- 분산 추적: Zipkin/Jaeger로 서비스 간 요청 추적
- 멀티노드 환경 + K8s 재도입: 클라우드 환경에서 HPA 자동 스케일링 실측

---

## 프로젝트 구조

```
GongGuHaSong/
├── member-service/       # 회원 관리
├── product-service/      # 상품(공구) 관리
├── order-service/        # 주문 처리
├── payment-service/      # 결제 (SAGA Orchestrator, MySQL)
├── point-service/        # 포인트 관리 (MySQL, SELECT FOR UPDATE)
├── search-service/       # 검색 + 실시간 랭킹
├── src/frontend/         # React 프론트엔드
├── load-test/            # k6 부하 테스트 스크립트
├── docker-compose.yml    # Docker Compose 배포
├── PAYMENT_TROUBLESHOOTING.md       # 분산 트랜잭션 & 동시성 & MongoDB→MySQL 전환기
├── REALTIME_SEARCH.md    # 실시간 검색어 랭킹 구축기 (ES + Nori + WebSocket)
├── PAYMENT_SECURITY.md   # 결제 보안 설계
├── DATABASE_SEPARATION.md# DB 분리 & Polyglot Persistence
├── MULTI_INSTANCE.md     # K8s 도입과 제거 — 깨달음
├── ARCHITECTURE.md       # 아키텍처 설계 & 통신 패턴
├── TROUBLESHOOTING.md    # Docker 배포 트러블슈팅 1
├── TROUBLESHOOTING2.md   # Docker 배포 트러블슈팅 2
└── TROUBLESHOOTING3.md   # K8s 전환 과정 트러블슈팅 (도입 시 겪은 이슈 기록)
```
