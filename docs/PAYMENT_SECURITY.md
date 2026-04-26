# 결제 시스템 보안 설계

## 1. 개요

공구하송의 결제 시스템은 포인트 결제와 카드 결제 두 가지 수단을 지원한다. 이 문서에서는 결제 시스템의 보안 설계를 다음 순서로 정리한다.

1. 보호 대상 — payment_db에 뭐가 저장되고, 왜 격리해야 하는지
2. DB 접근 권한 — 서비스별 계정 분리로 어떻게 격리했는지
3. PG사 연동 — 카드번호를 왜 직접 저장하면 안 되는지
4. HMAC 서명 — 결제 데이터 위변조를 어떻게 방지하는지

---

## 2. 보호 대상과 DB 접근 권한 관리

### payment_db에 저장되는 데이터

| 테이블 | 저장 데이터 | 개인정보 여부 |
|--------|-----------|:----------:|
| payment | 주문ID, 유저ID, 상품명, 금액, 결제방법, 승인번호, HMAC 서명 | △ (유저ID로 개인 식별 가능) |
| cards | 카드번호, 카드사, 소유자명, 유효기간, 한도, 사용금액 | 민감 개인정보 |
| stock_reservation | 상품ID, 유저ID, 수량, 만료시간 | △ |

cards 테이블의 카드번호 + 소유자명은 개인정보보호법상 민감정보에 해당한다. 현재는 Mock PG라 평문 저장하지만, API 응답에서는 `****-****-****-1234`로 마스킹하여 반환한다.

### 서비스별 DB 계정 분리 — 적용 완료

MySQL과 MongoDB 모두 서비스별 전용 계정을 생성하여, 각 서비스가 자기 DB에만 접근 가능하도록 분리했다.

- MySQL: `payment_user`(payment_db만), `point_user`(point_db만) — `mysql-init.sql`로 자동 생성.
- MongoDB: `member_user`, `product_user`, `order_user`, `search_user` — `mongo-init.js`로 자동 생성.

search-service가 해킹되어도 `search_user` 계정으로는 payment_db의 카드 정보에 접근 불가능하다.

---

## 3. PG사 연동과 카드 정보 보안

### 왜 카드번호를 직접 저장하지 않는가

실무에서는 카드번호를 서비스 서버에 직접 저장하지 않는다. PG사(Payment Gateway)가 카드 정보의 저장과 암호화를 전담한다.

```
[ 실제 결제 흐름 — PG사 연동 ]

1. 프론트엔드 → PG사 SDK (카드번호 입력)
   ※ 카드번호가 우리 서버를 거치지 않음

2. PG사 서버에서 카드 검증 + 암호화 저장
   → 빌링키(토큰) 발급

3. PG사 → 프론트엔드 → 우리 서버로 빌링키 전달
   ※ 우리 서버에는 빌링키만 저장

4. 결제 시: 우리 서버 → PG사에 빌링키 + 금액 전송
   → PG사가 카드사에 승인 요청
   → 승인 결과 반환
```

카드번호는 PG사 서버에만 존재하고, 우리 서버에는 빌링키(토큰)만 저장된다. 이렇게 하면.

- PCI-DSS 인증이 필요 없다 — 카드번호를 보관하지 않으므로 PCI-DSS 의무 대상에서 제외
- 카드번호 유출 위험이 없다 — 서버가 해킹되어도 빌링키만 노출되며, 빌링키만으로는 결제 불가 (PG사의 API Key가 추가로 필요)

> *"결제대행사(PG)를 이용하는 가맹점은 카드정보를 직접 처리하지 않으므로 PCI-DSS 인증 의무가 면제된다."*
> — 금융감독원 전자금융 감독 규정

### 이 프로젝트에서의 접근

이 프로젝트에서는 PG사 연동 없이 결제 흐름을 시뮬레이션하기 위해 카드사 API를 모킹(mocking)했다. 카드번호를 DB에 저장하고 있지만, 이는 PG사 없이 결제 프로세스를 구현하기 위한 포트폴리오 목적이며, 실제 운영 환경에서는 반드시 PG사(토스페이먼츠, NHN KCP 등)를 연동해야 한다.

```
[ 현재 구현 — Mock ]
프론트엔드 → 우리 서버 → Mock 카드사 API (CardService.getMockCardInfo())
                       → MySQL(payment_db.cards)에 카드번호 저장

[ 실제 운영 시 ]
프론트엔드 → PG사 SDK → PG사 서버 → 빌링키 발급
                                  → 우리 서버에는 빌링키만 저장
```

---

## 4. PG사 연동 시 서버 간 통신 보안 (HMAC 서명)

### 결제 승인은 프론트가 아니라 서버가 한다

"결제 요청은 프론트에서 하는 거 아냐?"라고 생각할 수 있지만, 실제 PG사 결제 흐름은 이렇다.

```
1. 사용자가 결제 버튼 클릭 (프론트)
2. 프론트 → PG사 SDK 호출 → PG사 결제창 띄움
3. 사용자가 카드번호 입력 → PG사가 처리
4. PG사 → 프론트에 paymentKey 반환 (결제 준비 완료)
5. 프론트 → 우리 백엔드 서버에 paymentKey + orderId + amount 전달
6. 우리 서버 → PG사에 "이 결제 승인해줘" 요청  ← 여기가 서버 간 통신
7. PG사 → 우리 서버에 승인 결과 응답
```

프론트는 결제창을 띄우고 paymentKey를 받아오는 역할만 한다. 실제 "승인"은 6번에서 우리 백엔드 서버가 PG사 서버에 보낸다. 왜 이렇게 하냐면, 프론트에서 직접 승인하면 브라우저 개발자 도구로 금액을 바꿔서 보낼 수 있기 때문이다. 서버에서 보내야 Secret Key도 안전하게 사용할 수 있다.

### 왜 서명이 필요한가

이 6번 구간(우리 서버 ↔ PG사 서버)에서 금액이 위변조되면 심각한 문제가 된다.

```
[ 위변조 시나리오 ]
우리 서버: "주문 123, 금액 50,000원 결제 승인 요청"
    ↓ 네트워크 구간
해커: 금액을 100원으로 변조
    ↓
PG사: "주문 123, 금액 100원 승인" → 사업자 49,900원 손실
```

### HMAC 서명 검증

HMAC(Hash-based Message Authentication Code)은 "이 메시지가 위변조되지 않았음"을 검증하는 방법이다.

HMAC이 필요한 핵심 상황은 하나다. "우리 서버가 외부에서 온 요청을 신뢰할 수 있느냐."

결제 시스템에서 외부 요청을 받는 대표적인 경우가 웹훅(Webhook)이다. 웹훅은 PG사가 결제 결과를 우리 서버로 알려주는 콜백인데, 문제는 아무나 우리 서버의 웹훅 URL에 "결제 완료됐다"는 가짜 요청을 보낼 수 있다는 것이다. HMAC 서명이 붙어있으면, PG사와 우리 서버만 알고 있는 Secret Key로 서명을 검증하여 가짜 요청을 걸러낼 수 있다.

반면 정기결제(빌링)처럼 우리 서버가 PG사에 요청을 보내는 경우에는, PG사가 Secret Key로 우리를 인증하기 때문에 우리가 별도로 HMAC을 구현할 필요는 없다.

```
[ 서명 원리 ]

1. 계약 시: PG사가 Secret Key를 발급 → 양쪽이 동일한 Key 보유

2. 결제 요청 시.
   우리 서버: HMAC-SHA256("주문123,50000원", Secret Key) = "abc123..."
   → 데이터 + 서명을 함께 전송

3. PG사 수신 시.
   PG사: HMAC-SHA256("주문123,50000원", Secret Key) = "abc123..."
   → 서명 일치 → 위변조 없음 ✅

   만약 금액이 변조되었다면.
   PG사: HMAC-SHA256("주문123,100원", Secret Key) = "xyz789..."
   → 서명 불일치 → 요청 거부 ❌
```

핵심: 같은 Key + 같은 데이터 = 같은 서명. 데이터가 1바이트라도 바뀌면 서명이 완전히 달라지므로 위변조를 탐지할 수 있다.

### HTTPS와 HMAC은 역할이 다르다

| | HTTPS | HMAC |
|---|---|---|
| 역할 | 전송 구간 암호화 (도청 방지) | 데이터 위변조 방지 (인증) |
| 보호 대상 | 네트워크를 지나가는 패킷 | 요청 데이터(금액, 주문ID) |
| 없으면 | 중간에서 데이터를 읽을 수 있다 | "이 요청이 진짜 우리 서버가 보낸 건지" 확인 불가 |

HTTPS만 있으면 도청은 방지되지만, PG사가 우리 서버로 보내는 웹훅(결제 결과 콜백)이 진짜 PG사가 보낸 건지 우리가 확인할 수 없다. 아무나 우리 서버에 "결제 완료됐다"는 가짜 요청을 보낼 수 있기 때문이다. HMAC 서명으로 "이 웹훅이 진짜 PG사가 보낸 것인지"를 우리 서버가 검증한다.

반대로, 우리 서버가 PG사에 보내는 승인 요청의 인증(Secret Key)은 PG사가 해주는 일이다. 우리가 HMAC을 쓰는 이유는 PG사를 검증하는 게 아니라, PG사가 보낸 응답/웹훅을 우리가 검증하기 위함이다.

또한 PG사 연동으로 빌링키 방식을 쓰더라도, 웹훅으로 전달되는 결제 결과의 위변조는 여전히 가능하므로 HMAC 서명 검증은 필요하다.

### 실제 PG사 적용 사례

토스페이먼츠 결제 승인 API를 예로 들면.

```
POST https://api.tosspayments.com/v1/payments/confirm

Headers.
  Authorization: Basic {Base64(Secret Key + ':')}

Body.
  {
    "paymentKey": "...",    // PG사가 발급한 결제 키
    "orderId": "order-123",
    "amount": 50000         // 서버에서 검증할 금액
  }
```

- Secret Key는 서버에서만 사용 (프론트엔드에 노출 금지)
- amount를 서버에서 다시 검증 — 프론트엔드에서 올라온 금액과 DB의 주문 금액을 비교
- HTTPS 통신으로 전송 구간 암호화

### 이 프로젝트에서의 적용

PG사 연동은 Mock이지만, HMAC 서명 검증 로직 자체는 구현했다. 결제 요청 시 orderId + amount로 서명을 생성하고, 검증에 통과해야만 결제가 진행된다.

```java
// HmacService.java — HMAC-SHA256 서명 생성/검증
public String sign(String orderId, int amount) {
    String data = orderId + ":" + amount;
    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(secretKey.getBytes(), "HmacSHA256"));
    return hex(mac.doFinal(data.getBytes()));
}

public boolean verify(String orderId, int amount, String signature) {
    return sign(orderId, amount).equals(signature);
    // 불일치 시 → "위변조 감지" 로그 + 요청 거부
}
```

```java
// PaymentService.createPayment() — 결제 전 HMAC 검증
String signature = hmacService.sign(orderId, totalAmount);
if (!hmacService.verify(orderId, totalAmount, signature)) {
    throw new ResponseStatusException(BAD_REQUEST, "결제 데이터 위변조 감지");
}
// → 검증 통과 후 SAGA 결제 흐름 진행
// → 결제 기록에 hmacSignature 필드로 서명값 저장
```

서버에서 금액을 재계산(`quantity * unitPrice`)하고, 그 값으로 서명을 생성/검증하기 때문에 프론트엔드에서 금액을 조작해도 위변조를 탐지할 수 있다.

---

## 5. 계정 분리 상세 — MySQL / MongoDB 각각의 적용 방법

보호 대상과 분리 이유는 2장에서 다뤘다. 여기서는 MySQL과 MongoDB 각각에서 구체적으로 어떻게 적용했는지를 정리한다.

### 서비스별 DB 계정 분리

서비스별 전용 DB 계정을 생성하여, 각 서비스가 자기 DB에만 접근 가능하도록 분리했다. point-service는 `point_user` 계정으로 point_db에만, payment-service는 `payment_user` 계정으로 payment_db에만 접근할 수 있다. MySQL 초기화 스크립트(`mysql-init.sql`)에서 계정 생성과 권한 부여를 자동으로 처리한다.

"DB 사용자"란 서비스를 이용하는 사람이 아니라, 각 마이크로서비스가 DB에 접속할 때 쓰는 인증 계정이다. 즉, payment-service는 `payment_user`라는 계정으로 접속하고, point-service는 `point_user`라는 계정으로 접속하도록 분리하는 것이다.

이 프로젝트에서는 Polyglot Persistence(MongoDB + MySQL)를 적용했으므로, DB 종류에 따라 계정 생성 방식이 다르다.

#### MySQL (payment-service, point-service — 금전 도메인)

MySQL에서는 `CREATE USER` + `GRANT`로 계정을 생성하고 특정 DB에만 권한을 부여한다.

```sql
-- 서비스별 MySQL 계정 생성
CREATE USER 'payment_user'@'%' IDENTIFIED BY 'payment-secret';
GRANT ALL ON payment_db.* TO 'payment_user'@'%';
-- payment_user는 payment_db에만 접근 가능. point_db는 접근 불가.

CREATE USER 'point_user'@'%' IDENTIFIED BY 'point-secret';
GRANT ALL ON point_db.* TO 'point_user'@'%';
-- point_user는 point_db에만 접근 가능. payment_db의 카드 정보는 접근 불가.
```

이 SQL은 MySQL 컨테이너 최초 기동 시 초기화 스크립트(`mysql-init.sql`)로 실행하거나, Docker Compose 환경변수(`MYSQL_USER`, `MYSQL_PASSWORD`)로 설정할 수 있다.

각 서비스의 application.yml에서 해당 계정으로 접속한다.

```yaml
# payment-service application.yml
spring:
  datasource:
    url: jdbc:mysql://mysql:3306/payment_db
    username: payment_user      # ← 이 계정으로 접속
    password: payment-secret
```

#### MongoDB (member, product, order, search — 비금전 도메인)

MongoDB에서는 `db.createUser()`로 database별 사용자를 생성한다.

```javascript
// mongo-init.js — 컨테이너 최초 기동 시 자동 실행
db = db.getSiblingDB('member-db');
db.createUser({
  user: "member_user",
  pwd: "member-secret",
  roles: [{ role: "readWrite", db: "member-db" }]
});
// member_user는 member-db에만 접근 가능.
```

Docker Compose에서 `/docker-entrypoint-initdb.d/` 경로에 이 스크립트를 넣으면 컨테이너 최초 기동 시 자동 실행된다. MongoDB에 `--auth` 옵션을 켜면 인증 없이는 접속이 거부된다.

#### 핵심

어떤 DB를 쓰든 원리는 동일하다. 서비스마다 전용 계정을 만들고, 해당 DB에만 권한을 부여하면 된다. search-service가 해킹되어도 `search_user` 계정으로는 payment_db의 카드 정보에 접근이 불가능하다.

### 카드 정보 컬렉션의 추가 보호

카드 정보는 결제 데이터 중에서도 특히 민감하다. payment-db 안에서도 cards 테이블에 대한 접근을 더 세밀하게 제어할 수 있다.

```javascript
// 카드 조회 전용 역할 — 읽기만 가능, 삭제/수정 불가
db.createRole({
  role: "cardReadOnly",
  privileges: [{
    resource: { db: "payment-db", collection: "cards" },
    actions: ["find"]   // 읽기만 허용
  }],
  roles: []
});

// 결제 처리 역할 — 카드 정보 읽기 + 결제 내역 쓰기
db.createRole({
  role: "paymentProcessor",
  privileges: [
    {
      resource: { db: "payment-db", collection: "cards" },
      actions: ["find", "update"]   // 읽기 + 사용금액 업데이트만
    },
    {
      resource: { db: "payment-db", collection: "payment" },
      actions: ["find", "insert", "update"]   // 결제 내역 CRUD
    }
  ],
  roles: []
});

// 카드 등록/삭제 역할 — 관리자용
db.createRole({
  role: "cardAdmin",
  privileges: [{
    resource: { db: "payment-db", collection: "cards" },
    actions: ["find", "insert", "update", "remove"]
  }],
  roles: []
});
```

이렇게 하면.
- 결제 처리 시: cards에서 카드 정보를 읽고(`find`), 사용 금액을 업데이트(`update`)만 가능
- 카드 등록/삭제: 별도 관리자 권한이 필요
- 다른 서비스: cards 테이블에 접근 자체가 불가

### 실무에서의 DB 접근 패턴

금융 시스템에서 일반적으로 사용하는 DB 접근 권한 패턴.

```
[ 접근 권한 매트릭스 ]

                    cards 테이블    payment 테이블    stock_reservation
payment-service     READ/UPDATE     READ/WRITE        READ/WRITE
(결제 처리)

payment-service     READ/WRITE      READ              READ
(카드 관리 API)

다른 서비스          접근 불가        접근 불가          접근 불가

DB 관리자           FULL            FULL              FULL
(운영팀)
```

### 이 프로젝트에서의 적용 상태

현재는 MongoDB 인증 없이(unauthenticated) 운영 중이다. Docker Compose의 MongoDB에 별도 인증 설정이 없어서, 누구든 모든 database에 접근할 수 있는 상태이다.

추가로 적용하면 더 강화되는 부분.

```yaml
# docker-compose.yml — MongoDB 인증 활성화
mongodb.
  image: mongo:5.0
  environment.
    - MONGO_INITDB_ROOT_USERNAME=admin
    - MONGO_INITDB_ROOT_PASSWORD=admin-secret
  volumes.
    - ./mongo-init.js:/docker-entrypoint-initdb.d/init.js

# mongo-init.js — 서비스별 사용자 생성
db = db.getSiblingDB('payment-db');
db.createUser({
  user: 'payment-user',
  pwd: 'payment-secret',
  roles: [{ role: 'readWrite', db: 'payment-db' }]
});

# 각 서비스 application.yml
spring.
  data.
    mongodb.
      host: mongodb
      database: payment-db
      username: payment-user
      password: payment-secret
      authentication-database: payment-db
```

---

## 6. 보안 레이어 요약

| 레이어 | 현재 상태 | 추가 적용 가능 |
|--------|-----------|-----------------|
| 카드번호 보관 | Mock — DB에 평문 저장 | PG사 연동, 빌링키만 저장 |
| 결제 통신 암호화 | HMAC-SHA256 서명 적용 (위변조 검증) | + HTTPS 적용 시 전 구간 암호화 |
| 금액 위변조 방지 | 서버에서 금액 재계산 (적용됨) | + PG사 금액 검증 이중 확인 |
| DB 격리 | MySQL + MongoDB 서비스별 계정 분리 (적용됨) | 완전 격리 |
| 카드 테이블 접근 | 서비스별 계정으로 제한 (적용됨) | + Role 기반 세부 접근 제어 추가 가능 |
| Secret Key 관리 | 해당 없음 (Mock) | 환경변수 / Vault |

### 현재 프로젝트에서 적용된 것

1. Polyglot Persistence — 금전 도메인(point, payment)은 MongoDB → MySQL로 리팩토링 완료. ACID 트랜잭션 네이티브 지원
2. SAGA 보상 트랜잭션 + CompensationOutbox — 결제 실패 시 포인트/카드 자동 롤백 (결제 3초 타임아웃 + 부하로 자연 실패를 유도해 검증, 유실률 90.4% → 0%)
3. 동시성 제어 — `@Transactional` + `SELECT FOR UPDATE` 비관적 락 (마이너스 잔액 0건)
4. API 기반 데이터 접근 — 서비스 간 직접 DB 접근 없음 (REST, Kafka)
5. 카드번호 마스킹 — API 응답에서 `---1234` 형태로 반환
6. 금액 서버 재계산 — 프론트엔드 금액 조작 방지
7. 카드 한도 검증 — 결제 시 잔여 한도 확인, 동시 결제 시에도 한도 초과 차단

### 적용한 것 / 미적용

| 항목 | 상태 | 구체적으로 |
|------|:----:|----------|
| DB 서비스별 계정 분리 | 적용 | MySQL: `payment_user`/`point_user`, MongoDB: `member_user`/`product_user`/`order_user`/`search_user`. 각 서비스가 자기 DB에만 접근 가능. |
| HMAC 서명 검증 | 적용 | `HmacService.java`에서 HMAC-SHA256으로 orderId+amount 서명 생성. `PaymentService.createPayment()`에서 SAGA 진입 전 서명 검증. 불일치 시 400 에러. 결제 기록에 `hmacSignature` 필드로 서명값 저장. |
| 금액 서버 재계산 | 적용 | 프론트에서 올라온 금액 무시, 서버에서 `quantity * unitPrice` 재계산. |
| 카드번호 마스킹 | 적용 | API 응답에서 `****-****-****-1234` 형태로 반환. DB에는 평문 저장 (Mock PG 한계). |
| 카드 한도 검증 | 적용 | 결제 시 잔여 한도 확인. 동시 결제 시에도 초과 차단. |
| PG사 연동 | 미적용 | Mock API로 결제 흐름 시뮬레이션. 실제 연동 시 빌링키 방식으로 전환 필요. |
| HTTPS | 미적용 | 로컬 Docker Compose 환경이라 도메인이 없음. 도메인 발급 시 적용 가능. |
