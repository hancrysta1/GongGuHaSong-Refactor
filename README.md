# 공구하송 — MSA 공동구매 플랫폼

> 6개 서비스 · 3종 DB · Kafka 이벤트 기반 설계
>
> 결제 보안(HMAC 위변조 검증, 카드 마스킹, DB 접근권한 분리) · SAGA 보상 트랜잭션 · 실시간 검색 랭킹(ES + WebSocket)까지 전체 시스템을 처음부터 설계한 프로젝트



## 프로젝트 개요

| 항목 | 내용                                                |
|------|---------------------------------------------------|
| 원본 개발 | 2022.03 ~ 2022.06 (4명 中 백엔드)                      |
| 리팩토링 | 2025.10 ~ 2026.01 (1인, 아키텍처/결제/검색/인프라 전체)         |
| 수상 | 숙명여대 SOLUX 27기 상반기 우수상                            |
| 리팩토링 방식 | 아키텍처 설계, 기술 선택, 결과 검증은 직접 수행.<br/>코드 작성은 AI 도구 활용. |


## 서비스 아키텍처

```
                              ┌──────────────────────────────────────────────┐
                              │              Kubernetes Cluster              │
                              │                                              │
Browser (React) ──REST────────→ │  Member   Product   Order   Payment  Point  │
                              │  :8081    :8082    :8083   :8085    :8084   │
                              │  MongoDB  MongoDB  MongoDB  MySQL    MySQL  │
                              │           +Redis           (SAGA)    +Redis │
  │                           │                                              │
  └──── WebSocket ←───────────│── Search (:8086, ES+Nori+MongoDB)            │
     (실시간 랭킹만)           │                                              │
                              │  ─ Kafka ─  ─ Redis ─  ─ Zookeeper ─       │
                              │  ─ MongoDB ─  ─ MySQL ─  ─ ES ─            │
                              └──────────────────────────────────────────────┘

[결제 흐름]
Browser → Order ──Feign(동기)──→ Product (재고 차감)
                    │            ↑ 재고 부족 시 즉시 거절해야 하므로 동기
               Kafka(비동기)
                    │            ↑ 1건 주문 → 3개 서비스 팬아웃, 결과를 기다릴 필요 없음
              ┌─────┼──────┐
              ▼     ▼      ▼
          Payment Point  Search (랭킹 갱신 → WebSocket → Browser)
              │
       RestTemplate(동기)
              ▼            ↑ 잔액 부족이면 결제 자체를 중단해야 하므로 동기
            Point (포인트 차감: SELECT FOR UPDATE)
              │
         실패 시 SAGA 보상 (포인트 복구)
```

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

**아키텍처**

| | Before | After |
|---|---|---|
| 구조 | 모놀리식 Spring Boot 1개 | MSA 6개 서비스 분리 |
| 배포 | 없음 | Docker Compose / Kubernetes |
| 서비스 디스커버리 | — | K8s Service DNS + kube-proxy |
| 서비스 간 통신 | — | Feign(동기) + Kafka(비동기) + RestTemplate |
| 결제 트랜잭션 | — | SAGA Orchestration (보상 트랜잭션) |
| 동시성 제어 | — | MySQL `SELECT FOR UPDATE` |
| DB | MongoDB 1개 | MongoDB + MySQL + ES (Polyglot) |
| 부하 테스트 | 없음 | k6 동시 1000명 동시성 검증 + 장애 주입 SAGA 보상 검증 (별도 테스트) |

<br>

**기술 스택**

| 영역 | Before | After |
|---|---|---|
| Backend | ![Spring Boot](https://img.shields.io/badge/Spring_Boot-2.7-6DB33F?logo=springboot&logoColor=white) ![Java](https://img.shields.io/badge/Java-11-007396?logo=openjdk&logoColor=white) | ![Spring Boot](https://img.shields.io/badge/Spring_Boot-2.7-6DB33F?logo=springboot&logoColor=white) ![Java](https://img.shields.io/badge/Java-11-007396?logo=openjdk&logoColor=white) ![OpenFeign](https://img.shields.io/badge/OpenFeign-HTTP_Client-6DB33F?logo=spring&logoColor=white) |
| Database | ![MongoDB](https://img.shields.io/badge/MongoDB-5.0-47A248?logo=mongodb&logoColor=white) | ![MongoDB](https://img.shields.io/badge/MongoDB-5.0-47A248?logo=mongodb&logoColor=white) ![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql&logoColor=white) ![Elasticsearch](https://img.shields.io/badge/Elasticsearch-7.17_(Nori)-005571?logo=elasticsearch&logoColor=white) ![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white) |
| Infra | — | ![Kubernetes](https://img.shields.io/badge/Kubernetes-Orchestration-326CE5?logo=kubernetes&logoColor=white) ![Docker](https://img.shields.io/badge/Docker-Container-2496ED?logo=docker&logoColor=white) ![Kafka](https://img.shields.io/badge/Apache_Kafka-Event_Driven-231F20?logo=apachekafka&logoColor=white) |
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

- Elasticsearch + Nori 한국어 형태소 분석, 역인덱스 기반 검색
- 이벤트 드리븐(즉시) + 60초 폴링(폴백) 하이브리드
- 자동완성/실제검색 API 분리 (랭킹 오염 방지)

### Kubernetes 전환
> [MULTI_INSTANCE.md](docs/MULTI_INSTANCE.md) / [TROUBLESHOOTING3.md](docs/TROUBLESHOOTING3.md)

- Docker Compose → K8s 전환, Eureka + API Gateway 제거 (K8s Service DNS + kube-proxy로 대체)
- HTTP Keep-Alive로 로드밸런싱 안 되는 문제 → 원인 분석 → `Connection: close` 해결
- K8s Deployment + Service로 수평 확장 구조 구성. 멀티노드 환경 부재로 스케일 아웃 성능 비교는 미검증

### DB 분리 & Polyglot Persistence
> [DATABASE_SEPARATION.md](docs/DATABASE_SEPARATION.md)

- 단일 MongoDB → Database per Service → MongoDB + MySQL + ES
- NoSQL이 적합한 곳 vs RDBMS가 필수인 곳 판단 근거

### 결제 보안 설계
> [PAYMENT_SECURITY.md](docs/PAYMENT_SECURITY.md)

### Docker 배포 트러블슈팅
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
├── src/frontend/           # React
└── k8s/                    # Kubernetes 매니페스트
```