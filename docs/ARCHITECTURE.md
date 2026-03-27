# 공구하송 - 아키텍처 설계 및 개선 방향

## 프로젝트 개요

공구하송은 공동구매 플랫폼으로, 모놀리식 Spring Boot 애플리케이션에서 마이크로서비스 아키텍처(MSA)로 전환한 프로젝트이다.

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Backend | Spring Boot 2.7.2, Spring Cloud 2021.0.8, Java 11 |
| Service Discovery | Docker Compose DNS + FeignClient url 직접 지정 (Eureka 제거) |
| API Gateway | 제거 (Spring Cloud Gateway 제거, Nginx로 프론트엔드 라우팅) |
| Database | MongoDB 5.0 |
| 검색 엔진 | Elasticsearch 7.17.10 (Nori 한국어 분석기) |
| 메시지 브로커 | Apache Kafka (Confluent 7.4.0) |
| 실시간 통신 | WebSocket (STOMP + SockJS) |
| Frontend | React 18, React Router 6, Axios |
| 인프라 | Docker Compose |

---

## 서비스 아키텍처

```
                          ┌─────────────────┐
                          │   React Client  │
                          │   (port 3000)   │
                          └────────┬────────┘
                                   │
                          ┌────────▼────────┐
                          │  Nginx Proxy    │
                          │   (port 3002)   │
                          └────────┬────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                     │
    ┌─────────▼──────┐  ┌────────▼────────┐  ┌────────▼────────┐
    │ Member Service │  │ Product Service │  │  Order Service  │
    │  (port 8081)   │  │  (port 8082)    │  │  (port 8083)    │
    └────────────────┘  └─────────────────┘  └────────┬────────┘
                                                       │
                                              Kafka (order-events)
                                                       │
                          ┌────────────────────────────┼──────────────────┐
                          │                            │                  │
               ┌──────────▼───────┐        ┌──────────▼──────┐  ┌───────▼─────────┐
               │  Point Service   │        │ Search Service  │  │Payment Service  │
               │  (port 8084)     │        │ (port 8086)     │  │ (port 8085)     │
               └──────────────────┘        └─────────────────┘  └─────────────────┘
```

### 서비스별 역할

| 서비스 | 포트 | 역할 |
|--------|------|------|


| Member Service | 8081 | 회원 관리, 쪽지 |
| Product Service | 8082 | 공구 상품, 수량조사, 찜하기 |
| Order Service | 8083 | 주문 처리, Kafka 이벤트 발행 |
| Point Service | 8084 | 포인트 적립/사용/취소, 이력 관리 |
| Payment Service | 8085 | 결제 처리, 재고 예약(30분 만료) |
| Search Service | 8086 | Elasticsearch 전문검색, 실시간 랭킹 |

---

## 핵심 설계 결정 및 근거

### 1. Feign 동기 호출 → Kafka 이벤트 드리븐 전환

Before (문제점).
```
주문 → Feign(SearchClient.recordOrder()) → 실패 시 주문도 영향
     → Feign(PointClient.earnPoints())   → 실패 시 주문도 영향
```
- 서비스 간 강결합: search-service 장애 시 order-service도 지연
- 연쇄 실패(Cascading Failure): 한 서비스 다운 → 전체 주문 플로우 차단
- try-catch로 감싸도 응답 지연은 피할 수 없음

After (개선).
```
주문 → Kafka(order-events 토픽 발행) → 즉시 응답
                    │
                    ├── point-service (구독) → 포인트 적립
                    ├── search-service (구독) → 랭킹 재계산 + WebSocket 즉시 푸시
                    └── payment-service (구독) → 재고 예약
```
- 느슨한 결합: 각 서비스가 독립적으로 이벤트 소비
- 장애 격리: point-service 다운 → 주문은 정상, 포인트는 복구 후 처리
- 확장성: 새 서비스 추가 시 토픽만 구독하면 됨 (order-service 수정 불필요)

Kafka를 선택한 이유 (vs RabbitMQ).
- 이벤트 재처리(replay)가 가능 → 장애 복구에 유리
- 높은 처리량(throughput)이 필요한 주문 이벤트에 적합
- Consumer Group 기반 수평 확장 용이

### 2. 실시간 검색 랭킹: 폴링 → 이벤트 드리븐 + 폴백

Before (문제점).
- `@Scheduled(fixedRate=10000)` — 10초마다 서버 타이머로 랭킹 브로드캐스트
- WebSocket 연결은 유지하지만 실질적으로 서버 사이드 폴링과 동일
- 데이터 변화가 없어도 불필요한 DB 조회 + 네트워크 전송 발생
- 주문 직후 최대 10초 지연

After (개선).
```
주문 발생 → Kafka → search-service OrderEventConsumer
                     → recordOrder() + calculateRankings()
                     → WebSocket /topic/rankings 즉시 푸시 (지연 ≈ 0)

검색 발생 → searchService.search() 내부에서 로그 저장
         → 60초 폴백 스케줄러가 검색 기반 변동분 보정
```
- 이벤트 드리븐: 주문 발생 시 즉시 랭킹 갱신 (진정한 실시간)
- 불필요한 전송 제거: 변화가 있을 때만 푸시
- 폴백 스케줄러(60초): 검색 로그 등 Kafka를 거치지 않는 변동분 보정

### 3. 랭킹 점수 산정 기준

```
점수 = 검색 횟수 × 0.4 + 주문량 × 0.6
```

| 지표 | 가중치 | 이유 |
|------|--------|------|
| 검색 횟수 | 0.4 | 관심도 반영, 단 검색만으로 순위 조작 가능하므로 낮게 |
| 주문량 | 0.6 | 실제 구매 전환 = 실질적 인기도, 비용 수반이므로 조작 어려움 |

- 집계 기간: 최근 1시간 (실시간성 확보)
- 순위 변동 표시: UP / DOWN / NEW / SAME

### 4. 재고 예약 패턴 (Stock Reservation)

```
주문 → Kafka → payment-service → 재고 예약(30분 TTL)
                                       │
                              결제 완료 → CONFIRMED
                              30분 초과 → @Scheduled(60s)로 자동 RELEASED
```

- 임시 예약 + 만료 해제 패턴으로 재고 정합성 확보
- 동시 주문 시 과판매(overselling) 방지
- 미결제 주문의 재고 점유를 자동 해제

### 5. 포인트 시스템 설계

| 이벤트 | 포인트 |
|--------|--------|
| 주문 확정 | +수량 × 100P (Kafka 이벤트) |
| 결제 시 사용 | -사용량 (Feign 동기 호출 — 잔액 검증 필수) |
| 환불 | +사용량 복구 (Feign 동기 호출) |

포인트 사용은 왜 Kafka가 아닌 Feign인가?
- 결제 시 포인트 차감은 잔액 검증 → 차감 → 결제 진행의 순서 보장 필요
- 비동기 처리 시 잔액 부족인데 결제가 진행되는 정합성 문제 발생
- 반면 적립은 실패해도 나중에 보상 가능 → 비동기(Kafka) 적합

---

## 서비스 간 통신 패턴 정리

| 패턴 | 사용처 | 이유 |
|------|--------|------|
| Kafka (비동기 이벤트) | 주문 → 포인트 적립, 랭킹 갱신, 재고 예약 | 팬아웃, 장애 격리, 순서 보장 불필요 |
| REST (동기 호출) | 결제 → 포인트 사용/환불 (SAGA 보상 트랜잭션 포함) | 즉시 응답(잔액 확인) 필요, 실패 시 역순 보상 |
| WebSocket (클라이언트 푸시) | 실시간 랭킹, 주문 알림 | 브라우저에 즉시 반영 |

---

## 인프라 구성

```yaml
# Docker Compose 서비스 구성 (6개 서비스 + 인프라)
MongoDB (27017)          - 상품, 주문, 회원, 검색 로그
MySQL (3306)             - 포인트, 결제 (금전 도메인 — Polyglot Persistence)
Elasticsearch (9200)     - 검색 엔진 (nori 플러그인)
Zookeeper (2181)         - Kafka 코디네이터
Kafka (9092)             - 이벤트 메시지 브로커

Docker Compose DNS       - 서비스 디스커버리 (서비스명으로 호출)
6 Microservices          - 비즈니스 로직
```

---

## 향후 개선 방향

### 구현 완료
- [x] SAGA 패턴 (Orchestration) — 결제 시 포인트 차감 → 카드 결제 → DB 저장, 실패 시 역순 보상. Chaos Engineering으로 검증 (포인트 유실률 10.35% → 0.08%)
- [x] 동시성 제어 — point-service: MySQL `SELECT FOR UPDATE` 비관적 락. 동시 10건에서 마이너스 잔액 0건
- [x] Polyglot Persistence — 금전 도메인(point, payment)은 MySQL, 나머지는 MongoDB. 서비스 특성에 맞는 DB 선택
- [x] Database per Service — 서비스별 독립 DB (MongoDB 4개 + MySQL 2개 + ES 1개)
- [x] Redis Cache — 상품 캐시, 랭킹 캐시, 포인트 캐시
- [x] 실시간 검색 랭킹 — Elasticsearch + Nori + WebSocket + Kafka 이벤트 드리븐

### 향후 개선
- [ ] Kafka Dead Letter Queue(DLQ) — SAGA 보상 실패 건 재처리
- [ ] Circuit Breaker (Resilience4j) — REST 호출(결제↔포인트)에 서킷 브레이커 적용
- [x] CompensationOutbox — 보상 트랜잭션 실패 건을 로컬 DB에 저장 → 30초 폴링 스케줄러 재시도 (최대 5회)
- [x] ~~Kubernetes 전환~~ — 도입 후 제거. 단일 노드 환경에서 K8s의 핵심 가치가 성립하지 않아 Docker Compose 유지 ([깨달음](MULTI_INSTANCE.md))
- [ ] 분산 추적 (Zipkin/Jaeger) — 서비스 간 요청 추적 및 병목 분석
