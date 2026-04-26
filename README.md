# 공구하송 — MSA 공동구매 플랫폼

> 개인사업자 중심으로 파편화된 공동구매를 하나의 플랫폼에서 실시간으로 참여할 수 있는 서비스<br>
> 6개 서비스 · 3종 DB · Kafka 이벤트 기반 · SAGA 보상 트랜잭션 · Redis 분산 락 · k6 부하 테스트 정량 검증
<br>

<br>

## 프로젝트 개요

| 항목 | 내용                                                |
|------|---------------------------------------------------|
| 원본 개발 | 2022.03 ~ 2022.06 (4명 中 백엔드)                      |
| 원본 깃허브 | https://github.com/GongGuHaSong/GongGuHaSong                      |
| 리팩토링 | 2025.10 ~ 2026.03 (1인, 아키텍처/결제/검색/인프라 전체)         |
| 수상 | 숙명여대 SOLUX 27기 상반기 우수상                            |
| 리팩토링 방식 | 아키텍처 설계, 기술 선택, 결과 검증은 직접 수행.<br/>코드 작성은 AI 도구 활용. |

<br>

## 서비스 아키텍처
<img width="1440" height="642" alt="image" src="https://github.com/user-attachments/assets/90027b21-24e6-4486-a03f-79a1164e642d" />


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
│   └── domain: Member, Note
├── product-service/        # 상품 관리 (MongoDB + Redis + Kafka)
│   └── domain: Sell, Survey, Like
├── order-service/          # 주문 처리 (MongoDB + Kafka)
│   └── domain: Registration
├── payment-service/        # 결제 — SAGA Orchestrator (MySQL)
│   └── domain: Payment, Card, CompensationOutbox
├── point-service/          # 포인트 — SELECT FOR UPDATE + Redis 분산 락 (MySQL + Redis)
│   └── domain: Point, PointHistory
├── search-service/         # 검색 + 실시간 랭킹 (ES + MongoDB)
│   └── domain: SearchDocument(ES), SearchLog, OrderRecord
├── load-test/              # k6 부하 테스트 스크립트
├── docker-compose.yml      # 6개 서비스 + 인프라 통합 배포
└── src/frontend/           # React
```

<br>

## 데이터베이스 구조

> 물리 인스턴스는 MySQL 1대, MongoDB 1대를 공유하되, 서비스별로 논리 스키마를 분리하고 전용 계정으로 접근 권한을 격리했다. (`mysql-init.sql`, `mongo-init.js`에서 서비스별 DB + 유저 생성, 자기 DB에만 읽기/쓰기 권한 부여)
>
> 서비스 간 FK 없이 userId, orderId로 논리적 참조. 통신은 Feign/Kafka만 사용.
>
> `──→` 같은 DB 내 참조 (JPA)  ·  `···→` 서비스 간 논리적 참조 (FK 없음)

### MySQL
<img width="800" height="954" alt="image" src="https://github.com/user-attachments/assets/a8dda6bc-dd74-4e58-966b-23e009687227" />


### MongoDB + Elasticsearch
<img width="800" height="1014" alt="image" src="https://github.com/user-attachments/assets/10d99e3e-82e9-41db-bd14-a48c3c70ff22" />




<br>

## 주문·결제 흐름
### 주문 → Kafka 팬아웃

> 1건 주문이 3개 서비스에 동시 전달되는 이벤트 드리븐 구조
>
<br>
<img width="800" height="1250" alt="image" src="https://github.com/user-attachments/assets/50afe0e4-1c8b-45a0-9c89-308bc1b9c103" />



<br>

| 단계 | 흐름 | 방식 | 이유 |
|------|------|------|------|
| 재고 차감 | Order → Product | Feign 동기 | 재고 부족 시 즉시 거절 |
| 후속 처리 | Order → Kafka → Point, Search, Product | 비동기 팬아웃 | 적립·랭킹·캐시 = 도메인 다름 |
| 결제 | 클라이언트 → Payment (SAGA) | REST 동기 | 포인트 차감·카드 결제·보상까지 오케스트레이터가 순서 제어 |




<br>
<br>

### 결제 — SAGA Orchestration
<br>
<img width="800" height="1546" alt="image" src="https://github.com/user-attachments/assets/4ad70683-f29e-48d7-a75a-31826fd40b82" />


<br>
<br>

| | 성공 흐름 | 실패 시 보상 |
|---|---|---|
| STEP 1 | HMAC 위변조 검증 | — |
| STEP 2 | 포인트 차감 (동기) + 카드 결제 | ③ 포인트 복구, ② 카드 환불 |
| STEP 3 | 결제 기록 MySQL 저장 | ④ 재고 복구 |
| 주문 적립 | Kafka로 수량 × 100P 자동 적립 | ① 적립 포인트 회수 |
| 보상 실패 시 | — | CompensationOutbox 저장 → 30초 폴링 재시도 (최대 5회) |



<br>
<br>

## 실시간 검색 랭킹

> ES + Nori 한국어 형태소 분석 · 이벤트 드리븐 즉시 갱신 + 60초 폴링 폴백

| 항목 | 내용 |
|------|------|
| 점수 산정 | 검색횟수 x 0.4 + 주문량 x 0.6 (최근 1시간) |
| 갱신 방식 | 주문 시 Kafka → 즉시 재계산, 검색 시 직접 재계산 |
| 전달 | Redis 캐시 + WebSocket push |
| 자동완성 | `/suggest` — ES 조회만, 로그 미저장 (랭킹 오염 방지) |

<br>
<br>

# 레거시 → 리팩토링

## 원본 (2022, 4인 팀)
- 깃허브 링크 : https://github.com/GongGuHaSong/GongGuHaSong
- 교내 공구 참여 사이트. 참여 요청, 쪽지, 찜, 회원가입 기능
- MongoDB 단일 DB, 모놀리식 구조, 결제/재고/검색 없음

<br>

## 원본의 한계

| 영역 | 문제 |
|------|------|
| 결제 | 없음. "참여 요청"만 존재하고 실제 금액 처리 없음 |
| 재고 | 없음. 수량 제한 없이 무한 참여 가능 |
| 동시성 | 고려 안 됨. 동시 요청 시 데이터 정합성 미보장 |
| DB | MongoDB 단일 DB에 모든 데이터. 금전 데이터도 트랜잭션 없이 처리 |
| 검색 | 없음 |
| 인프라 | 로컬 실행만 가능, 컨테이너화 없음 |

결제/재고/포인트를 새로 만드는 건 당연하고, 진짜 문제는 **여러 명이 동시에 주문할 때 금액과 재고가 꼬이지 않게 하는 것**이었다.

<br>

## 리팩토링 여정 (2025.10 ~ 2026.03)

### 1단계: MSA 전환 + 결제/재고/검색 신규 구축

모놀리식 → 6개 마이크로서비스로 분리. 결제(SAGA), 재고(원자적 차감), 검색(ES + 실시간 랭킹)을 새로 설계했다.

| | Before (2022, 팀) | After (리팩토링, 1인) |
|---|---|---|
| 컨셉 | 교내 공구 참여 + 쪽지 커뮤니티 | 쇼핑몰형 공구 플랫폼 |
| 구매 | 참여 요청만 (결제 없음) | 포인트/카드 실시간 결제 |
| 재고 | 없음 | 자동 차감, 최소수량 달성률 표시 |
| 검색 | 없음 | ES + Nori 한국어 검색, 실시간 랭킹 |


<br>

### 2단계: 부하 테스트로 문제 발견 → 해결

기능을 만든 것만으로는 부족했다. k6로 실제 부하를 걸어보니 단건에서는 보이지 않던 문제들이 드러났다.

| 발견한 문제 | 원인 | 해결 | 검증 결과 |
|------------|------|------|-----------|
| 재고 초과 판매 (300명 → 300건 성공) | 조회-체크-차감 분리 → race condition | MongoDB `findAndModify` 원자적 차감 | 10,000명 동시 주문에서 정확히 100건만 성공 |
| 포인트 차감-이력 간 누락 | MongoDB에서 별도 연산 → 중간 실패 시 불일치 | MySQL 전환 + `@Transactional` | 차감과 이력이 하나의 트랜잭션 |
| 동시 적립/차감 시 마이너스 잔액 | MongoDB `findAndModify`로는 다중 문서 원자성 미보장 | MySQL `SELECT FOR UPDATE` 비관적 락 | 21만 건 동시 요청에서 마이너스 잔액 0건 |
| SAGA 보상이 오히려 유실 악화 (90.4% → 97.1%) | 보상 호출이 커넥션 풀에 추가 부하 → 보상 자체가 실패 | CompensationOutbox (로컬 DB 저장 + 30초 폴링 재시도) | 최종 유실 0건 |

<br>

### 3단계: 대용량 환경에서의 구조적 한계 확인 → Redis 분산 락

2단계에서 적용한 DB 비관적 락(`SELECT FOR UPDATE`)은 단일 인스턴스에서는 잘 동작했다. 그러나 300 VU 부하에서 **p95 469ms, max 2.26s**로 지연이 쌓이기 시작했고, timeout이 DB 락 API에서 집중 발생했다.

타임아웃만으로 원인을 단정할 수는 없었지만, 인터넷에 서치하며 여러 문서를 보다 보니
<br> DB 비관적 락을 사용하면 `@Transactional` 에 진입과 동시에 커넥션을 점유하는 구조 때문에 락을 못 잡아도 커넥션은 잡고 있게 된다는 사실을 알게 됐다. <br> 
<br> 반면에 Redis 분산 락은 `@Transactional` 바깥에서 락을 얻고 대기 후 락을 얻었을 때 트랜잭션을 진입하기 때문에 커넥션 점유가 없다.

<br>
실제로 point-service 3대 + nginx 로드밸런서 환경에서 비교 실험을 진행한 결과, Redis 분산 락이 처리량과 지연 모두에서 우위를 보였다.
<br>

| 지표 (3대, 300 VU, 2분) | DB 비관적 락 | Redis 분산 락 |
|------------------------|------------|-------------|
| 처리량 | 30,145건 (251 TPS) | **40,580건 (338 TPS)** |
| p95 지연 | 1.09s | **704ms** |
| 성공률 | 100% | 100% |
| 마이너스 잔액 | 0명 | 0명 |

<br>

## 기술 스택

| 영역 | Before | After |
|---|---|---|
| Backend | ![Spring Boot](https://img.shields.io/badge/Spring_Boot-2.7-6DB33F?logo=springboot&logoColor=white) ![Java](https://img.shields.io/badge/Java-11-007396?logo=openjdk&logoColor=white) | ![Spring Boot](https://img.shields.io/badge/Spring_Boot-2.7-6DB33F?logo=springboot&logoColor=white) ![Java](https://img.shields.io/badge/Java-11-007396?logo=openjdk&logoColor=white) ![OpenFeign](https://img.shields.io/badge/OpenFeign-HTTP_Client-6DB33F?logo=spring&logoColor=white) |
| Database | ![MongoDB](https://img.shields.io/badge/MongoDB-5.0-47A248?logo=mongodb&logoColor=white) | ![MongoDB](https://img.shields.io/badge/MongoDB-5.0-47A248?logo=mongodb&logoColor=white) ![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql&logoColor=white) ![Elasticsearch](https://img.shields.io/badge/Elasticsearch-7.17_(Nori)-005571?logo=elasticsearch&logoColor=white) ![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white) |
| Infra | — | ![Docker](https://img.shields.io/badge/Docker_Compose-Container-2496ED?logo=docker&logoColor=white) ![Kafka](https://img.shields.io/badge/Apache_Kafka-Event_Driven-231F20?logo=apachekafka&logoColor=white) |
| Frontend | ![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black) | ![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black) |
| Test | — | ![k6](https://img.shields.io/badge/k6-Load_Test-7D64FF?logo=k6&logoColor=white) |

<br>
<br>

# 시연

<br>

## 실시간 검색어 (키워드) <br>

```
랭킹 점수 = 검색횟수 × 0.4  +  주문량 × 0.6   (최근 1시간 기준)
```

| 가중치 | 지표 | 이유 |
|--------|------|------|
| **0.4** | 검색횟수 (최근 1시간) | 관심도 반영 |
| **0.6** | 주문량 (최근 1시간) | 실제 구매 전환이 더 강한 신호 |

<br>
<br>

- 단순 검색 시 (가중치 0.4) <br>
![Image](https://github.com/user-attachments/assets/868beffe-5022-480c-8b13-4238d458166f)

<br>
<br>
- 주문 전/후 비교 (가중치 0.6) <br> 
전 (단순 검색만 진행했을 때) <br>
<img width="266" height="211" alt="image" src="https://github.com/user-attachments/assets/b9d8cfa2-2bf5-4530-9a6e-cfa105f9c411" />
<br><br>
후 (주문까지 진행했을 때, 가중치가 높아 최상위로 랭킹) <br>
<img width="327" height="259" alt="image" src="https://github.com/user-attachments/assets/4a5169c6-6e74-4f99-ba0f-cfe3f86cf420" />
<br>
<br>


## 주문 & 결제 <br>
<br>

- 결제 전 금액 상태 (포인트 10만p, 카드 잔여 한도 1,010,000원) <br>
<img width="800" height="842" alt="image" src="https://github.com/user-attachments/assets/d37962fa-157a-446b-b659-02641ceaa151" />
<br><br>

- 결제 전 재고 상태 (진행률 38%, 재고 370개) <br>
<img width="800" height="766" alt="image" src="https://github.com/user-attachments/assets/a7cec371-2209-4d53-af24-b6b0d5d7c0ab" />
<br>
<br>
<br>
<br>

- 주문 과정 gif (잔액-재고-실검 흐름 확인, 잔액과 재고는 차감되고 실검은 구매(0.6)*검색(0.4) 비율에 따라 랭킹 실시간 재조정) <br>
![Image](https://github.com/user-attachments/assets/c139c97b-2b09-4318-ace9-5bf6c8005669)

<br>
<br>

- 주문 -> 결제 후 금액 상태 (포인트 2000p, 카드 잔여 한도 210,000원) <br>
=> 포인트 -10만p, 카드 -80만 (총 90만) + 포인트 적립 2000p (20개 * 개당 100p 적립)
<img width="800" height="788" alt="image" src="https://github.com/user-attachments/assets/00f13d34-20c3-4261-8c0c-6d4eb3e6ac62" />
<br><br>

- 주문 -> 결제 후 재고 상태 (진행률 63%, 재고 350개) <br>
<img width="800" height="755" alt="image" src="https://github.com/user-attachments/assets/a219af25-c61a-4681-9d78-285e6e95b70e" />
<br>
<br>


<br>
<br>
<br>
<br>

## 테스트

### 부하 테스트(1) 재고 동시성 (mongoDB) <br>

```
100개의 재고를 가진 물품을 최대 10,000명의 유저가 동시 구매하는 시나리오를 가정.
```

<br>
<br>
<br>

-  before (동시성 보장 전) <br>

<img width="744" height="770" alt="image" src="https://github.com/user-attachments/assets/fa8ce06a-7c27-4c45-863a-63d555773150" />
<br>
<br>
=> 각자 요청 시 재고를 수시로 덮어씌워서 (예: VU-1~50이 동시에 stock=100 읽음 → 각자 99로 저장 → 50건 차감인데 1건만 반영)<br>
-200개가 아닌 33개 남은 것이 된 것으로 추정 <br>
=> 결과: 300건 중 300건 모두 결제 완료 (결제 건수 목표 대비 200% 초과), 재고 33개 남음  <br>
                                                                                 
<br>
<br>

<br>
<br>
<br>

- After (findAndModify로 조회+차감 원자성 보장 + 재고 정합성 보장) <br>
<img width="733" height="758" alt="image" src="https://github.com/user-attachments/assets/e4fe6557-0642-4c58-b052-43db60af76ca" />

<br>
<br>
=> 결과: 300명의 유저의 동시 요청 중 100건만 결제 완료, 재고 0개 남음 (정확도 100%)
<br>
<br>

<br>
<br>
<br>
<img width="785" height="511" alt="image" src="https://github.com/user-attachments/assets/901246d3-78f7-47a4-be9f-43ec98631c31" />

<br>
<br>
=> 결과: 3,000명의 유저의 동시 요청 중 100건만 결제 완료, 재고 0개 남음 (정확도 100%)

<br>
<br>
<br>
<img width="770" height="512" alt="image" src="https://github.com/user-attachments/assets/68c4db57-84b8-4ce8-8c1d-2cf8b7d903dd" />
<br>
<br>
=> 결과: 10,000명의 유저의 동시 요청 중 100건만 결제 완료, 재고 0개 남음 (정확도 100%)

<br>
<br>
<br>

### 부하 테스트(2) 포인트 동시성 (MySQL) <br>
k6 테스트 스크립트에서 매 요청마다 10P씩 차감하도록 설계했다. <br>

<img width="822" height="835" alt="image" src="https://github.com/user-attachments/assets/d77c0eb8-2ce9-4f97-9790-c6ee72bf3e68" />
<br>
<br>
=> 결과: 300 VU × 5분, 총 213,185건(709 TPS)의 동시 적립/차감 요청 중 마이너스 잔액 0건 (SELECT FOR UPDATE 정합성 검증 완료)

<br>

```
  300 VU × 5분, 총 213,185건 (709 TPS)
  마이너스 잔액:  0건
  성공률:        50.43% (잔액 부족으로 정상 거절된 차감 요청 포함 — 적립/차감 반반 설계)
  p95 지연:      469ms
  max 지연:      2.26s
  총 HTTP 요청:  426,520건 (1,418 req/s)
```

=> 정합성은 완벽. 성공률 50%는 적립/차감 반반 설계에서 잔액 부족 거절 포함된 정상 수치. <br>
=> 다만 **p95 469ms, max 2.26s** — 300 VU에서 request timeout 발생 시작. <br>

<br>
<br>

### 부하 테스트(2-1) DB 비관적 락 vs Redis 분산 락 <br>

```
point-service 3대 + nginx 로드밸런서, 300 VU, 2분간 총 4만 건 부하
DB 비관적 락 vs Redis 분산 락 정량 비교
```

<br>


| 지표 | DB 비관적 락 | Redis 분산 락 |
|------|------------|-------------|
| 처리량 | 30,145건 (251 TPS) | **40,580건 (338 TPS)** |
| p95 지연 | 1.09s | **704ms** |
| 성공률 | 100% | 100% |
| 마이너스 잔액 | 0명 | 0명 |

<br>
<img width="810" height="774" alt="image" src="https://github.com/user-attachments/assets/3efda334-2d13-4675-a547-ec78999da36a" />

<br>

=> 결과: Redis 분산 락이 처리량 34% 높고, p95 지연은 35% 낮음 <br>
<br>
<br>
<br>


### 결제 보상 로직 테스트 — 3초 타임아웃 + 부하로 자연 실패 유도 <br>

```
50→300 VU 단계별 부하 + 결제 요청 3초 타임아웃 (응답 지연 누적 시 클라이언트가 끊음)
1인 1결제, 검증: 결제 실패 시 포인트가 복구되는가?
```
<br>

- before (보상 없음) <br>

<img width="764" height="687" alt="image" src="https://github.com/user-attachments/assets/5760bd15-5a84-4284-b92f-b72d776a4915" />
<br>
<br>
=> 성공률 71.78% (부하가 올라갈수록 응답 지연이 누적되어 타임아웃 자연 실패가 발생), 실시간 누락 건수 656건 <br>
=> 결과: 실제 요청 7263건 중 약 726건이 응답 대기 중 타임아웃되어 결제 실패가 있었으며, 그 중 656건의 포인트 유실이 발생 (90.4% 유실)

<br>
<br>

<br>
<br>
<br>

- after (SAGA 보상 트랜잭션 + Outbox) <br>
<img width="773" height="753" alt="image" src="https://github.com/user-attachments/assets/efec7c33-c6e5-48ef-95ba-d29302fa5583" />
<br>
<br>
=> 성공률 73.74%, 실시간 누락 건수 854건 — 그러나 k6 test 후 DB 조회 최종 유실 0건 <br>
=> 결과: 실제 요청 7,408건 중 10%의 결제 실패 유도로 약 740건의 결제 실패가 있었으며, 실시간 측정에서는 854건의 유실이 감지되었으나 (부하로 인한 타임아웃 이슈 예상) <br> 
SAGA 보상 + Outbox 재시도 완료 후 최종 유실 0건 (100% 복구)  


<br>
<br>
<br>

<br>
<br>
<br>

# 기술적 의사결정 & 트러블슈팅

### 분산 트랜잭션 & 동시성 — 문제 발견부터 해결까지
> [PAYMENT_TROUBLESHOOTING.md](docs/PAYMENT_TROUBLESHOOTING.md)

- MongoDB `findAndModify`로 포인트 차감 → 차감-이력 간 누락 발견 → MySQL `@Transactional`로 전환
- 낙관적 락/비관적 락 충돌 발견 → 금전 도메인은 비관적 락으로 통일
- SAGA 보상 적용 → 오히려 악화(90.4% → 97.1% 유실) → 원인: 보상 호출이 커넥션 풀에 추가 부하 → CompensationOutbox로 해결 (최종 유실 0건)
- DB 비관적 락의 구조적 한계 (`@Transactional` 안에서 락 대기 = 커넥션 점유) → Redis 분산 락으로 락 대기를 트랜잭션 바깥으로 분리. `RedisLockPointFacade`(락) + `RedisLockPointInnerService`(`@Transactional`) 별도 Bean 분리

### k6 부하 테스트 — 문제를 발견하는 도구
> [LOAD_TEST.md](docs/LOAD_TEST.md)

- 위 문제들은 전부 부하 테스트에서 발견했다. 단건에서는 보이지 않는 문제가 300명 동시 요청에서 드러남
- 재고 동시성: 300명 → 3,000명 → 10,000명 스파이크에서 초과 판매 0건
- SAGA 보상 3단계 비교: Before(90.4% 유실) → SAGA only(97.1%, 오히려 악화) → SAGA+Outbox(0% 유실)
- DB 락 vs Redis 락: 단일 인스턴스에서 p95 469ms 한계 확인 → 3대 비교 실험으로 커넥션 점유 병목 검증 → Redis 분산 락이 처리량 34%↑, p95 35%↓

### 실시간 검색어 랭킹
> [REALTIME_SEARCH.md](docs/REALTIME_SEARCH.md)

- Elasticsearch + Nori 한국어 형태소 분석, 역인덱스 기반 검색
- 이벤트 드리븐(즉시) + 60초 폴링(폴백) 하이브리드
- 자동완성/실제검색 API 분리 (랭킹 오염 방지)
- 띄어쓰기 검색 에러, 랭킹 오염, 폴링→이벤트 드리븐 전환 트러블슈팅

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
