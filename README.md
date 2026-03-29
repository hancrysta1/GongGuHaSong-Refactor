# 공구하송 — MSA 공동구매 플랫폼

> 개인사업자 중심으로 파편화된 공동구매를 하나의 플랫폼에서 실시간으로 참여할 수 있는 서비스<br>
> 6개 서비스 · 3종 DB · Kafka 이벤트 기반 · SAGA 보상 트랜잭션 · k6 부하 테스트 정량 검증
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
├── product-service/        # 상품 관리 (MongoDB + Redis + Kafka 캐시 동기화)
├── order-service/          # 주문 처리 (MongoDB + Kafka)
├── payment-service/        # 결제 — SAGA Orchestrator (MySQL)
├── point-service/          # 포인트 — SELECT FOR UPDATE (MySQL + Redis)
├── search-service/         # 검색 + 실시간 랭킹 (ES + MongoDB)
└── src/frontend/           # React
```

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

# What is different?

## 원본
- 깃허브 링크 : https://github.com/GongGuHaSong/GongGuHaSong
- 프로젝트 요약: 교내 공구를 위한 사이트, 공구 참여 요청, 쪽지, 찜, 회원가입 기능

<br>
<br>

## 리팩토링

### 기능

| | Before (2022, 팀) | After (리팩토링, 1인) |
|---|---|---|
| 컨셉 | 교내 공구 참여 + 쪽지 커뮤니티 | 쇼핑몰형 공구 플랫폼 |
| 구매 | 참여 요청만 (결제 없음, 갯수 직접 입력) | 포인트/카드 실시간 결제, +/- 수량 조절 |
| 재고 | 없음 | 자동 차감, 최소수량 달성률 표시 |
| 검색 | 없음 | ES + Nori 한국어 검색, 실시간 랭킹 (신규) |

<br>
<br>


### 기술 스택

| 영역 | Before | After |
|---|---|---|
| Backend | ![Spring Boot](https://img.shields.io/badge/Spring_Boot-2.7-6DB33F?logo=springboot&logoColor=white) ![Java](https://img.shields.io/badge/Java-11-007396?logo=openjdk&logoColor=white) | ![Spring Boot](https://img.shields.io/badge/Spring_Boot-2.7-6DB33F?logo=springboot&logoColor=white) ![Java](https://img.shields.io/badge/Java-11-007396?logo=openjdk&logoColor=white) ![OpenFeign](https://img.shields.io/badge/OpenFeign-HTTP_Client-6DB33F?logo=spring&logoColor=white) |
| Database | ![MongoDB](https://img.shields.io/badge/MongoDB-5.0-47A248?logo=mongodb&logoColor=white) | ![MongoDB](https://img.shields.io/badge/MongoDB-5.0-47A248?logo=mongodb&logoColor=white) ![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql&logoColor=white) ![Elasticsearch](https://img.shields.io/badge/Elasticsearch-7.17_(Nori)-005571?logo=elasticsearch&logoColor=white) ![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white) |
| Infra | — | ![Docker](https://img.shields.io/badge/Docker_Compose-Container-2496ED?logo=docker&logoColor=white) ![Kafka](https://img.shields.io/badge/Apache_Kafka-Event_Driven-231F20?logo=apachekafka&logoColor=white) |
| Frontend | ![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black) | ![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black) |
| Test | — | ![k6](https://img.shields.io/badge/k6-Load_Test-7D64FF?logo=k6&logoColor=white) |

<br>
<br>

### 주요 성과

| 항목 | Before | After |
|------|--------|-------|
| 결제 장애 시 포인트 유실 | 10.35% (k6 장애 주입 테스트) | 0.08% (SAGA 보상 트랜잭션) |
| 동시 결제 시 이중 차감 / 마이너스 잔액 | 발생 | 0건 (MySQL SELECT FOR UPDATE) |
| 포인트 차감-이력 불일치 | 발생 (MongoDB 별도 연산) | 0건 (MySQL @Transactional) |

<br>
<br>

## 시연
<br>

### 실시간 검색어 (키워드) <br>

```
랭킹 점수 = 검색횟수 × 0.4  +  주문량 × 0.6   (최근 1시간 기준)
```

| 가중치 | 지표 | 이유 |
|--------|------|------|
| **0.4** | 검색횟수 (최근 1시간) | 관심도 반영 |
| **0.6** | 주문량 (최근 1시간) | 실제 구매 전환이 더 강한 신호 |

<br>
<br>

- 실검 랭킹 변화 1) 단순 검색 시 (가중치 0.4) <br>
![Image](https://github.com/user-attachments/assets/868beffe-5022-480c-8b13-4238d458166f)

<br>
<br>
- 2) 주문 전/후 비교 <br> 
전 (단순 검색만 진행했을 때) <br>
<img width="266" height="211" alt="image" src="https://github.com/user-attachments/assets/b9d8cfa2-2bf5-4530-9a6e-cfa105f9c411" />
<br><br>
후 (주문까지 진행했을 때, 가중치가 높아 최상위로 랭킹) <br>
<img width="327" height="259" alt="image" src="https://github.com/user-attachments/assets/4a5169c6-6e74-4f99-ba0f-cfe3f86cf420" />
<br>
<br>


### 주문 & 결제 <br>
<br>

- 결제 전 금액 상태 (포인트 10만p, 카드 잔여 한도 1,010,000원) <br><br>
<img width="800" height="842" alt="image" src="https://github.com/user-attachments/assets/d37962fa-157a-446b-b659-02641ceaa151" />
<br><br>

- 결제 전 재고 상태 (진행률 38%, 재고 370개) <br><br>
<img width="800" height="766" alt="image" src="https://github.com/user-attachments/assets/a7cec371-2209-4d53-af24-b6b0d5d7c0ab" />
<br>
<br>

- 주문 과정 gif (잔액-재고-실검 흐름 확인, 잔액과 재고는 차감되고 실검은 구매(0.6)*검색(0.4) 비율에 따라 랭킹 실시간 재조정) <br>
![Image](https://github.com/user-attachments/assets/c139c97b-2b09-4318-ace9-5bf6c8005669)

<br>
<br>

- 주문 -> 결제 후 금액 상태 (포인트 2000p, 카드 잔여 한도 210,000원) <br><br>
=> 포인트 -10만p, 카드 -80만 (총 90만) + 포인트 적립 2000p (20개 * 개당 100p 적립)
<br>
<br>
<img width="800" height="788" alt="image" src="https://github.com/user-attachments/assets/00f13d34-20c3-4261-8c0c-6d4eb3e6ac62" />
<br><br>

- 주문 -> 결제 후 재고 상태 (진행률 63%, 재고 350개) <br><br>
<img width="800" height="755" alt="image" src="https://github.com/user-attachments/assets/a219af25-c61a-4681-9d78-285e6e95b70e" />
<br>
<br>


<br>
<br>

### 부하 테스트(1) 재고 동시성 <br>

```
100개의 재고를 가진 물품을 300명의 유저가 동시 구매하는 시나리오를 가정함.
```

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

- After (findAndModify로 조회+차감 원자성 보장) <br><br>
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
=> 결과: 3000명의 유저의 동시 요청 중 100건만 결제 완료, 재고 0개 남음 (정확도 100%)

<br>
<br>
<br>

<br>
<br>
<br>

### Chaos 테스트(2) 결제 보상 로직 <br>

```
결제 실패 시, 원자적으로 처리 된 재고/포인트/결제 로직이 제대로 원상 복구되는지 테스트.
1인 1결제로 공유 자원은 없지만,
커넥션 풀의 이슈/n명의 실패 데이터가
유실 되지 않고 잘 전달되어 복구에 성공하는가 확인하는 데 의의가 있음.
(실제 서비스에 여러 유저가 몰렸을 때에도 안전하게 금액의 정합성을 보장하기 위함)
고로, 네트워크의 장애가 발생하는 시나리오로 10%의 의도적 실패 주입 -> 복구 확인이 목표.
```
<br>

<br>

<br>
- before (보상 없음) <br>
<img width="764" height="687" alt="image" src="https://github.com/user-attachments/assets/5760bd15-5a84-4284-b92f-b72d776a4915" />
<br>
<br>
<br>
=> 성공률 71.78% (기대는 90%이지만 외부 요인이 더해져 성공률이 낮아짐), 실시간 누락 건수 656건 <br>
=> 결과: 실제 요청 7263건 중 10%의 결제 실패 유도로 약 726건의 결제 실패가 있었으며, 그 중 656건의 포인트 유실이 발생 (90.4% 유실)

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

### 분산 트랜잭션 & 동시성 & MongoDB→MySQL 전환
> [PAYMENT_TROUBLESHOOTING.md](docs/PAYMENT_TROUBLESHOOTING.md)

- Chaos Engineering으로 22,998건 중 2,380건 유실 → SAGA 보상 트랜잭션 → 99.2% 개선
- MongoDB `findAndModify` 한계 발견 → MySQL `SELECT FOR UPDATE` 리팩토링, ACID 전부 테스트 검증

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
