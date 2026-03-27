# Database per Service 패턴 적용

## 1. 왜 DB를 분리했는가

### 변경 전: 단일 DB 공유

```
MongoDB (database: sm)
├── member 컬렉션    ← member-service 접근
├── sell 컬렉션      ← product-service 접근
├── registration 컬렉션 ← order-service 접근
├── payment 테이블   ← payment-service 접근
├── cards 테이블     ← payment-service 접근
├── point 컬렉션     ← point-service 접근
├── search_log 컬렉션 ← search-service 접근
└── ...
→ 모든 서비스가 동일한 database에 접근 가능
→ order-service가 member 컬렉션을 직접 조회할 수 있음
→ 사실상 모놀리식 DB
```

이 구조에서는 서비스 간 데이터 경계가 없다. 코드 레벨에서는 마이크로서비스로 분리되어 있지만, DB 레벨에서는 하나의 애플리케이션과 다를 바 없다. 어떤 서비스든 다른 서비스의 컬렉션에 직접 접근할 수 있기 때문에, 서비스 간 결합도가 높아지고, 한 서비스의 스키마 변경이 다른 서비스에 영향을 줄 수 있다.

### 변경 후: 서비스별 DB 분리

```
MongoDB 인스턴스
├── member-db       ← member-service 전용
│   └── member, note 컬렉션
├── product-db      ← product-service 전용
│   └── sell, like, survey 컬렉션
├── order-db        ← order-service 전용
│   └── registration 컬렉션
├── payment_db (MySQL)  ← payment-service 전용
│   └── payment, cards, stock_reservation 테이블
├── point_db (MySQL)    ← point-service 전용
│   └── point, point_history 컬렉션
└── search-db       ← search-service 전용
    └── search_log, order_record 컬렉션
```

각 서비스는 자신의 database에만 접근할 수 있다. 다른 서비스의 데이터가 필요하면 반드시 API(REST, Kafka)를 통해서만 요청해야 한다.

### 적용 근거

1. MSA의 핵심 원칙 — Database per Service 패턴

> *"Each service has its own private database. Any other service that needs that data must use the first service's API."*
> — Chris Richardson, Microservices Patterns (Manning, 2018)

마이크로서비스의 핵심 가치는 서비스 간 독립적 배포와 확장이다. DB를 공유하면 스키마 변경 시 모든 서비스를 함께 수정해야 하므로, 독립적 배포가 불가능해진다.

2. 금융 서비스의 데이터 격리 요건

이 프로젝트는 결제와 포인트를 다루는 서비스이다. 결제 정보(카드, 결제 내역)와 회원 정보가 같은 database에 있으면.
- payment-service의 보안 취약점이 회원 정보 유출로 이어질 수 있음
- 개발자가 실수로 다른 서비스의 데이터를 직접 수정할 수 있음

DB를 분리하면 blast radius(영향 범위)가 해당 서비스로 한정된다.

3. 서비스별 독립적 스케일링

향후 특정 서비스의 트래픽이 증가하면 해당 서비스의 DB만 독립적으로 스케일업(replica set, sharding)할 수 있다. DB가 공유되어 있으면 전체를 함께 스케일링해야 한다.

### Polyglot Persistence — 서비스 특성에 맞는 DB 선택 (업데이트)

초기에는 전 서비스 MongoDB 논리적 분리였으나, 동시성 문제를 해결하면서 금전 도메인은 RDBMS가 적합하다는 걸 체감하여 point-service와 payment-service를 MySQL로 리팩토링했다.

| 서비스 | DB | 선택 근거 |
|--------|-----|----------|
| product-service | MongoDB | 카테고리별 스키마 유연성 (의류→사이즈, 문구→색상) |
| member-service | MongoDB | 현재 충분, 규모 시 MySQL 검토 |
| order-service | MongoDB | 현재 충분, 정합성 강화 시 MySQL 검토 |
| point-service | MySQL | 금전 데이터. `@Transactional` + `SELECT FOR UPDATE`로 차감+이력 원자적 처리 |
| payment-service | MySQL | 결제 기록, 감사 추적. SAGA 보상 트랜잭션 + ACID 보장 |
| search-service | ES + MongoDB | 전문 검색(ES + Nori), 검색/주문 로그(MongoDB) |

현재 인프라: MongoDB 1개 + MySQL 1개 + Elasticsearch 1개 (Docker Compose)

프로덕션에서는 금전 도메인 DB를 별도 인스턴스로 물리적 분리하는 것이 권장된다.

### 서비스 간 데이터 접근 방식

DB가 분리되면 서비스 간 데이터 접근은 반드시 API를 통해야 한다.

```
[ DB 공유 시 — 안티패턴 ]
order-service → MongoDB(sm).member 컬렉션 직접 조회
→ member-service 스키마 변경 시 order-service도 수정 필요

[ DB 분리 후 — 올바른 패턴 ]
order-service → REST → member-service → MongoDB(member-db)
→ member-service의 API만 유지하면 내부 스키마는 자유롭게 변경 가능
```

이 프로젝트에서의 서비스 간 데이터 접근 현황.

| 호출 방향 | 방식 | 용도 |
|-----------|------|------|
| payment → point | REST | 포인트 조회/차감/환불 |
| order → product | Feign (REST) | 재고 조회/차감 |
| member → point | RestTemplate | 회원가입 시 포인트 부여 |
| order → payment/point/search | Kafka | 주문 이벤트 전파 |

모든 서비스 간 데이터 접근이 API를 통해 이루어지고 있으며, DB 직접 접근은 없다.

---

## 2. 적용 방법

### application.yml 변경

각 서비스의 `spring.data.mongodb.database` 값을 서비스 전용 이름으로 변경.

```yaml
# 변경 전 (모든 서비스 동일)
spring.
  data.
    mongodb.
      database: sm

# 변경 후 (서비스별)
# member-service:  database: member-db
# product-service: database: product-db
# order-service:   database: order-db
# payment-service: database: payment-db
# point-service:   database: point-db
# search-service:  database: search-db
```

MongoDB는 database가 존재하지 않으면 첫 데이터 삽입 시 자동 생성하므로, 별도의 DB 생성 작업이 필요 없다.

### Docker Compose 환경

Docker 환경에서는 환경변수 `SPRING_DATA_MONGODB_HOST=mongodb`로 MongoDB 호스트를 지정하고, database 이름은 각 서비스의 application.yml에 정의되어 있으므로 추가 설정이 필요 없다.
