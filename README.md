# 공구하송 — MSA 공동구매 플랫폼

> 개인사업자 중심으로 파편화된 공동구매를 하나의 플랫폼에서 실시간으로 참여할 수 있는 서비스
>
> 6개 서비스 · 3종 DB · Kafka 이벤트 기반 · SAGA 보상 트랜잭션 · k6 부하 테스트 정량 검증



## 프로젝트 개요

| 항목 | 내용                                                 |
|------|----------------------------------------------------|
| 원본 개발 | 2022.03 ~ 2022.06 (4명 中 백엔드)                       |
| 리팩토링 | 2025.10 ~ 2026.03 (1인, 아키텍처/결제/검색/인프라 전체)          |
| 수상 | 숙명여대 SOLUX 27기 상반기 우수상                             |
| 리팩토링 방식 | 아키텍처 설계, 기술 선택, 결과 검증은 직접 수행.<br/>코드 작성은 AI 도구 활용. |


## 서비스 아키텍처

| 서비스 | DB | 역할 |
|--------|-----|------|
| Member :8081 | MongoDB | 회원 관리 |
| Product :8082 | MongoDB + Redis | 상품, 재고, 주문 수량 캐시 |
| Order :8083 | MongoDB + Kafka | 주문 생성 → Kafka 이벤트 발행 |
| Payment :8085 | MySQL | **SAGA 오케스트레이터** — 결제 + 역순 보상 |
| Point :8084 | MySQL + Redis | 포인트 차감/적립 (`SELECT FOR UPDATE`) |
| Search :8086 | ES + Nori + MongoDB | 한국어 검색 + 실시간 랭킹 (WebSocket) |

### 주문 → Kafka 팬아웃

> 1건 주문이 4개 서비스에 동시 전달되는 이벤트 드리븐 구조

| 단계 | 흐름 | 방식 | 이유 |
|------|------|------|------|
| 재고 차감 | Order → Product | Feign 동기 | 재고 부족 시 즉시 거절 |
| 후속 처리 | Order → Kafka → Payment, Point, Search, Product | 비동기 팬아웃 | 재고예약·적립·랭킹·캐시는 주문 응답에 불필요 |

### 결제 — SAGA Orchestration

> Payment가 오케스트레이터로서 STEP 1~3을 순서대로 실행. 실패 시 역순 보상.

| | 성공 흐름 | 실패 시 보상 |
|---|---|---|
| STEP 1 | HMAC 위변조 검증 | — |
| STEP 2 | 포인트 차감 (동기) + 카드 결제 | ③ 포인트 복구, ② 카드 환불 |
| STEP 3 | 결제 기록 MySQL 저장 | ④ 재고 복구 |
| 주문 적립 | Kafka로 수량 × 100P 자동 적립 | ① 적립 포인트 회수 |
| 보상 실패 시 | — | CompensationOutbox 저장 → 30초 폴링 재시도 (최대 5회) |

### 실시간 검색 랭킹

> ES + Nori 한국어 형태소 분석 · 이벤트 드리븐 즉시 갱신 + 60초 폴링 폴백

| 항목 | 내용 |
|------|------|
| 점수 산정 | 검색횟수 x 0.4 + 주문량 x 0.6 (최근 1시간) |
| 갱신 방식 | 주문 시 Kafka → 즉시 재계산, 검색 시 직접 재계산 |
| 전달 | Redis 캐시 + WebSocket push |
| 자동완성 | `/suggest` — ES 조회만, 로그 미저장 (랭킹 오염 방지) |

<br>

## What is different?

### 원본
- 깃허브 링크 : 
- 공구 참여 요청, 쪽지, 찜, 회원가입 기능 개발
- MongoDB 설계, React 프론트엔드


### 리팩토링

**기능**

| | Before (2022, 팀) | After (리팩토링, 1인) |
|---|---|---|
| 컨셉 | 교내 공구 참여 + 쪽지 커뮤니티 | 쇼핑몰형 공구 플랫폼 |
| 구매 | 참여 요청만 (결제 없음, 갯수 직접 입력) | 포인트/카드 실시간 결제, +/- 수량 조절 |
| 재고 | 없음 | 자동 차감, 최소수량 달성률 표시 |
| 검색 | 없음 | ES + Nori 한국어 검색, 실시간 랭킹 (신규) |

<br>
<br>

**기술 스택**

| 영역 | Before | After |
|---|---|---|
| Backend | ![Spring Boot](https://img.shields.io/badge/Spring_Boot-2.7-6DB33F?logo=springboot&logoColor=white) ![Java](https://img.shields.io/badge/Java-11-007396?logo=openjdk&logoColor=white) | ![Spring Boot](https://img.shields.io/badge/Spring_Boot-2.7-6DB33F?logo=springboot&logoColor=white) ![Java](https://img.shields.io/badge/Java-11-007396?logo=openjdk&logoColor=white) ![OpenFeign](https://img.shields.io/badge/OpenFeign-HTTP_Client-6DB33F?logo=spring&logoColor=white) |
| Database | ![MongoDB](https://img.shields.io/badge/MongoDB-5.0-47A248?logo=mongodb&logoColor=white) | ![MongoDB](https://img.shields.io/badge/MongoDB-5.0-47A248?logo=mongodb&logoColor=white) ![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql&logoColor=white) ![Elasticsearch](https://img.shields.io/badge/Elasticsearch-7.17_(Nori)-005571?logo=elasticsearch&logoColor=white) ![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white) |
| Infra | — | ![Docker](https://img.shields.io/badge/Docker_Compose-Container-2496ED?logo=docker&logoColor=white) ![Kafka](https://img.shields.io/badge/Apache_Kafka-Event_Driven-231F20?logo=apachekafka&logoColor=white) |
| Frontend | ![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black) | ![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black) |
| Test | — | ![k6](https://img.shields.io/badge/k6-Load_Test-7D64FF?logo=k6&logoColor=white) |

<br>

## 주요 성과

| 항목 | Before | After |
|------|--------|-------|
| 결제 장애 시 포인트 유실 | 10.35% (k6 장애 주입 테스트) | 0.08% (SAGA 보상 트랜잭션) |
| 동시 결제 시 이중 차감 / 마이너스 잔액 | 발생 | 0건 (MySQL SELECT FOR UPDATE) |
| 포인트 차감-이력 불일치 | 발생 (MongoDB 별도 연산) | 0건 (MySQL @Transactional) |

<br>

## 시연

<!-- 아래 항목들을 GIF 또는 스크린샷으로 추가 -->

| 시연 항목 | 설명 |
|-----------|------|
| 결제 흐름 | 상품 선택 → 장바구니 → 포인트/카드 결제 → 주문 완료 |
| 실시간 랭킹 | 검색/주문 시 랭킹 실시간 변동 (WebSocket push) |
| 재고 차감 | 수량 조절 → 최소수량 달성률 표시 → 재고 자동 차감 |
| k6 부하 테스트 | 터미널에서 300명 동시 결제 돌아가는 모습 + 결과 summary |

> 시연 영상/GIF 준비 후 교체 예정

<br>


## 기술적 의사결정 & 트러블슈팅

### 분산 트랜잭션 & 동시성 & MongoDB→MySQL 전환
> [PAYMENT_TROUBLESHOOTING.md](docs/PAYMENT_TROUBLESHOOTING.md)

- Chaos Engineering으로 22,998건 중 2,380건 유실 → SAGA 보상 트랜잭션 → 99.2% 개선
- MongoDB `findAndModify` 한계 발견 → MySQL `SELECT FOR UPDATE` 리팩토링, ACID 전부 테스트 검증

### 실시간 검색어 랭킹
> [REALTIME_SEARCH.md](docs/REALTIME_SEARCH.md)

- 상세 설계 및 트러블슈팅 (띄어쓰기 검색 에러, 랭킹 오염, 폴링→이벤트 드리븐 전환)

### Kubernetes 도입과 제거 — 깨달음
> [MULTI_INSTANCE.md](docs/MULTI_INSTANCE.md)

- 대용량 트래픽 대응을 위해 K8s를 도입했으나, 단일 노드 환경에서는 K8s의 핵심 가치(self-healing, HPA, 롤링 업데이트)가 성립하지 않음을 인지
- 피상적 도입보다 확실한 필요에 의한 선택이라는 판단으로 제거. 과정에서 Eureka 제거, 인프라에 따른 코드 동작 차이 등을 학습

### DB 분리 & Polyglot Persistence
> [DATABASE_SEPARATION.md](docs/DATABASE_SEPARATION.md)

- 단일 MongoDB → Database per Service → MongoDB + MySQL + ES
- NoSQL이 적합한 곳 vs RDBMS가 필수인 곳 판단 근거

### 결제 보안 설계
> [PAYMENT_SECURITY.md](docs/PAYMENT_SECURITY.md)

### Docker Compose 배포 트러블슈팅
> [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) / [TROUBLESHOOTING2.md](docs/TROUBLESHOOTING2.md)

- 6개 서비스 + 인프라 통합 배포 과정의 이슈 해결 (Nginx DNS, WebSocket 프록시, ES 기동 순서, Kafka 세션 충돌 등)

<br>

## 실행 방법

```bash
docker compose up -d
# → http://localhost:3002
```

<br>

## 프로젝트 구조

```
GongGuHaSong/
├── member-service/         # 회원 관리 (MongoDB)
├── product-service/        # 상품 관리 (MongoDB + Redis)
├── order-service/          # 주문 처리 (MongoDB + Kafka)
├── payment-service/        # 결제 — SAGA Orchestrator (MySQL)
├── point-service/          # 포인트 — SELECT FOR UPDATE (MySQL)
├── search-service/         # 검색 + 실시간 랭킹 (ES + MongoDB)
└── src/frontend/           # React
```