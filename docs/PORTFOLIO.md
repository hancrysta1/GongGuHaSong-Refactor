# 공구하송 — 공동구매 플랫폼 리팩토링

> 교내 공구 커뮤니티 사이트를 쇼핑몰형 공동구매 플랫폼으로 리팩토링한 프로젝트.
> 모놀리식 → MSA → Kubernetes 전환, 결제 시스템 신규 구축, 실시간 검색 도입.

---

## 프로젝트 정보

| 항목 | 내용 |
|------|------|
| 원본 개발 | 2022.03 ~ 2022.06 (4명, 본인: 백엔드) |
| 리팩토링 | 2025.10 ~ 2026.01 (1인, 아키텍처/결제/검색/인프라 전체) |
| 수상 | 숙명여대 SOLUX 27기 상반기 우수상 |

### 내가 한 것 (리팩토링)

- 모놀리식 → MSA 6개 서비스 분리 + Kubernetes 전환.
- 결제 시스템 신규 구축 (포인트/카드, SAGA 보상 트랜잭션, 동시성 제어).
- Elasticsearch + Nori 한국어 검색 엔진 + 실시간 랭킹 구축.
- MongoDB → MySQL 리팩토링 (금전 도메인 ACID 보장).
- k6 부하 테스트 (Chaos Engineering, 동시 300명 22,000건).
- Docker Compose → Kubernetes 전환, Eureka/API Gateway 제거.

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
| 아키텍처 | 모놀리식 Spring Boot | MSA 6개 서비스 + Kubernetes |
| DB | MongoDB 1개 | MongoDB + MySQL + ES (Polyglot) |
| 트래픽 | 고려 없음 | 부하 테스트 22,000건, 3대 스케일 아웃 |

---

## 시연

<!-- 로컬에서 녹화 후 링크 교체 -->
> 시연 영상: (준비 중)

---

## 서비스 구조도

```
                              ┌──────────────────────────────────────────────┐
                              │              Kubernetes Cluster              │
                              │                                              │
Browser ──REST──→ K8s Service → │  Member   Product   Order   Payment  Point  │
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

검색 → Search에서 직접 랭킹 재계산 → Redis 캐시 갱신 → WebSocket push.
주문 → Order → Kafka(order-events) → Search에서 주문 기록 저장 + 랭킹 재계산 → Redis 캐시 갱신 → WebSocket push.
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
         ▲ order_id, user_id (논리적 참조)
         │
┌─── product_db (MongoDB) ──────┐  ┌─── order_db (MongoDB) ────────┐
│                                │  │                                │
│  sell (컬렉션)                 │  │  order (컬렉션)                │
│  ┌────────────────────────┐   │  │  ┌────────────────────────┐   │
│  │ _id (ObjectId)          │   │  │  │ _id (ObjectId)          │   │
│  │ title                   │   │  │  │ title ·····→ (sell.title) │ │
│  │ managerId               │   │  │  │ userId                  │   │
│  │ price, stock, min_count │   │  │  │ total_Count             │   │
│  │ category (의류/문구/...) │   │  │  │ method (현장배부/택배)   │   │
│  │ startDate, finishDate   │   │  │  │ status (CONFIRMED/      │   │
│  │ mainPhoto, sizePhoto    │   │  │  │         CANCELLED)      │   │
│  │ notice, info            │   │  │  │ createdAt               │   │
│  └────────────────────────┘   │  │  └────────────────────────┘   │
└────────────────────────────────┘  └────────────────────────────────┘
                                              │
                                         Kafka: order-events
                                              ▼
┌─── search_db (MongoDB) + Elasticsearch ──────────────────────┐
│                                                               │
│  ES: products (인덱스)        search_log        order_record  │
│  ┌──────────────────┐   ┌───────────────┐  ┌──────────────┐ │
│  │ title (Nori분석)   │   │ keyword        │  │ title         │ │
│  │ info (Nori분석)    │   │ userId         │  │ count         │ │
│  │ category (Keyword)│   │ searchedAt     │  │ orderedAt     │ │
│  │ price, stock      │   └───────────────┘  └──────────────┘ │
│  │ managerId         │                                        │
│  └──────────────────┘   랭킹 = 검색횟수×0.4 + 주문량×0.6     │
└───────────────────────────────────────────────────────────────┘
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
                  실패 시 → SAGA 보상 (포인트 복구, 카드 환불)
```

---

## 기술 스택

| 분류 | 기술 |
|------|------|
| Backend | Spring Boot 2.7, Java 11, OpenFeign |
| Database | MongoDB, MySQL, Elasticsearch (Nori), Redis |
| Message | Apache Kafka, WebSocket (STOMP) |
| Infra | Kubernetes (Service, kube-proxy), Docker |
| Test | k6 (Chaos Engineering 부하 테스트) |
| Frontend | React 18 |

---

## 핵심 성과

| 항목 | 수치 |
|------|------|
| SAGA 보상 트랜잭션 | 포인트 유실률 10.35% → 0.08% (99.2% 개선) |
| 동시성 제어 | 마이너스 잔액 0건, 차감=이력 100% 일치 |
| K8s 스케일 아웃 | 3대 Pod 분배 확인, 잔액 정확 (8,000P) |
| 부하 테스트 | 동시 300명, 22,000건 결제, 성공률 99.71% |
| DB 리팩토링 | 금전 도메인 MongoDB → MySQL (ACID 전부 검증) |
| 인프라 전환 | Eureka 제거 → K8s Service DNS + kube-proxy |

---

## 상세 기술 문서

| 문서 | 내용 |
|------|------|
| [PAYMENT_TROUBLESHOOTING.md](PAYMENT_TROUBLESHOOTING.md) | 결제 시스템 트러블슈팅 (SAGA + 동시성 제어) |
| [REALTIME_SEARCH.md](REALTIME_SEARCH.md) | ES + Nori + WebSocket 실시간 검색 구축 |
| [MULTI_INSTANCE.md](MULTI_INSTANCE.md) | K8s 스케일 아웃 + Eureka 제거 + 기업 사례 |
| [DATABASE_SEPARATION.md](DATABASE_SEPARATION.md) | DB 분리 + Polyglot Persistence |
| [PAYMENT_SECURITY.md](PAYMENT_SECURITY.md) | 결제 보안 설계 (카드 마스킹, 금액 서버 재계산, 한도 검증, DB 접근 권한 분리) |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Docker 트러블슈팅 |
| [TROUBLESHOOTING3.md](TROUBLESHOOTING3.md) | K8s 전환 트러블슈팅 |
