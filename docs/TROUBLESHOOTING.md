# Troubleshooting - Docker Compose 통합 배포

프론트엔드(React) + 백엔드(Spring Boot MSA)를 Docker Compose로 통합 배포하면서 발생한 이슈와 해결 과정을 기록한다.

---

## 1. Nginx upstream 호스트 resolving 실패

### 문제
프론트엔드 컨테이너(Nginx)가 기동되지 않았다.
```
nginx: [emerg] host not found in upstream "api-gateway" in /etc/nginx/conf.d/default.conf:11
```

### 파악 + 근거
에러 메시지를 보면 `host not found in upstream`으로, Nginx가 `api-gateway`라는 호스트를 DNS에서 찾지 못한 것이다.

Docker Compose에서 `depends_on`을 설정해두었지만, `depends_on`은 컨테이너 시작 순서만 보장할 뿐 해당 서비스가 완전히 준비되었는지는 보장하지 않는다. Docker 공식 문서에서도 이 점을 명시하고 있다.

> *"depends_on does not wait for a container to be 'ready' — only until it's been started."*
> — [Docker Docs: depends_on](https://docs.docker.com/compose/compose-file/05-services/#depends_on)

즉, `api-gateway` 컨테이너가 시작은 되었지만 아직 네트워크에 등록되기 전에 Nginx가 설정을 로드하면서 DNS resolve를 시도한 것이다. Nginx는 기본적으로 시작 시점에 단 한 번만 upstream의 DNS를 resolve하고, 이 시점에 실패하면 프로세스 자체가 기동되지 않는다.

백엔드 개발을 할 때는 Eureka 기반의 서비스 디스커버리를 사용했기 때문에, 서비스가 뜨는 순서에 크게 신경 쓸 필요가 없었다. Eureka 클라이언트는 주기적으로 레지스트리를 폴링하면서 동적으로 서비스 목록을 갱신하기 때문이다. 그래서 "앞단의 리버스 프록시도 당연히 비슷하게 동작하겠지"라고 생각한 것이 실수였다. 이전에 네트워크 수업에서 "DNS는 캐싱과 resolve 시점이 중요하다"는 내용을 들었던 기억이 있어서, Nginx가 DNS를 언제 resolve하는지를 중심으로 원인을 추적할 수 있었다.

### 해결 + 근거
Nginx 공식 문서의 [proxy_pass with variable](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass) 섹션을 참고했다. `proxy_pass`에 변수를 사용하면 Nginx는 시작 시점이 아닌 요청 시점에 동적으로 DNS를 resolve한다. 이때 `resolver` 지시어로 DNS 서버를 명시해야 한다.

Docker는 컨테이너 간 서비스 디스커버리를 위해 내장 DNS 서버(`127.0.0.11`)를 제공한다.
> *"Containers that use a custom network use Docker's embedded DNS server at 127.0.0.11."*
> — [Docker Docs: Embedded DNS server](https://docs.docker.com/engine/network/#dns-services)

변경 전.
```nginx
location /api/ {
    proxy_pass http://api-gateway:8080/api/;
}
```

변경 후.
```nginx
location /api/ {
    resolver 127.0.0.11 valid=30s;
    set $upstream http://api-gateway:8080;
    proxy_pass $upstream/api/;
}
```

- `resolver 127.0.0.11` : Docker 내장 DNS 서버를 명시적으로 지정
- `set $upstream` : 변수를 사용하여 요청 시점에 DNS resolve
- `valid=30s` : DNS 캐시 TTL을 30초로 설정하여 컨테이너 재시작 시에도 대응

### 깨달음
백엔드에서 Eureka나 Kubernetes의 서비스 디스커버리에 익숙해져 있으면, 모든 네트워크 컴포넌트가 동적으로 서비스를 찾아줄 것이라 착각하기 쉽다. 하지만 Nginx 같은 리버스 프록시는 기본적으로 시작 시점에 DNS를 확정짓는다. MSA에서는 백엔드 코드 바깥의 인프라 — 리버스 프록시, 로드밸런서, DNS — 도 요청 경로의 일부이기 때문에, 각 컴포넌트가 서비스를 언제, 어떻게 찾는지 파악하고 있어야 장애 원인을 빠르게 추적할 수 있다.

---

## 2. 포트 충돌 (Port already allocated)

### 문제
Docker Compose로 프론트엔드를 배포하려 하자 포트 바인딩 에러가 발생했다.
```
Bind for 0.0.0.0:3000 failed: port is already allocated
```

### 파악 + 근거
`lsof -i :3000` 명령어로 확인한 결과, 로컬에서 `npm start`로 실행 중인 React 개발 서버(PID 55396)가 이미 3000 포트를 점유하고 있었다.

TCP/IP에서 하나의 포트는 하나의 프로세스만 바인딩할 수 있다(POSIX 소켓 API의 `bind()` 시스템 콜 제약). Docker 컨테이너가 호스트의 포트에 바인딩할 때도 동일한 제약이 적용된다.
> *"If the host port is already in use, Docker will fail to start the container."*
> — [Docker Docs: Published ports](https://docs.docker.com/engine/network/#published-ports)

### 해결 + 근거
두 가지 선택지가 있었다.
1. 기존 프로세스를 종료하고 동일 포트 사용
2. Docker 컨테이너의 호스트 포트를 변경

개발 중에는 로컬 개발 서버(`npm start`)와 Docker 배포를 동시에 사용할 수 있는 환경이 편리하므로, Docker 포트를 `3002`로 변경하는 방식을 선택했다.

```yaml
frontend.
  build: ./src/frontend
  ports.
    - "3002:80"  # 호스트 3002 → 컨테이너 80(Nginx)
```

### 깨달음
백엔드에서도 마이크로서비스를 로컬에서 여러 개 띄울 때 포트 충돌을 자주 경험한다. Spring Boot의 `server.port`를 서비스마다 다르게 설정하듯이, Docker 환경에서도 호스트 포트 매핑을 체계적으로 관리하는 컨벤션이 필요하다. 이번 경험 이후 docker-compose.yml에 포트 배정 규칙을 주석으로 명시해두기로 했다.

---

## 3. API 응답 형태 불일치로 인한 프론트엔드 런타임 에러

### 문제
프론트엔드 화면이 렌더링되지 않고 콘솔에 런타임 에러가 출력되었다.
```
Uncaught (in promise) TypeError: t.sort is not a function at App.js:39
```

### 파악 + 근거
`App.js`에서 `/sell/all` API 응답에 바로 `.sort()`를 호출하는데, 백엔드가 아직 기동되지 않은 상태에서는 정상적인 배열 대신 에러 객체나 Spring의 Whitelabel Error Page(HTML)가 반환된다. JavaScript의 `.sort()`는 `Array.prototype`에만 존재하므로 응답이 배열이 아니면 `TypeError`가 발생한다.
> *"The sort() method sorts the elements of an array in place. It is not a function on plain objects."*
> — [MDN: Array.prototype.sort()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort)

이 에러의 직접적인 원인은 프론트엔드 코드의 방어 로직 부재이지만, 근본적인 원인은 백엔드 API의 응답 형태가 통일되어 있지 않다는 것이다.

실제로 이 프로젝트의 백엔드 컨트롤러들을 확인해보면 응답 형태가 제각각이다.

| 엔드포인트 | 반환 타입 |
|-----------|-----------|
| `GET /sell/all` | `List<Sell>` |
| `GET /sell/{id}` | `Sell` |
| `GET /survey/count/{sellId}` | `int` |
| `POST /order` | `Registration` |
| `DELETE /my/like/{id}` | `void` |

어떤 API는 리스트를 반환하고, 어떤 API는 단일 객체를, 어떤 API는 원시 타입을, 또 어떤 API는 아무것도 반환하지 않는다. 에러 발생 시에도 `ResponseStatusException`을 통해 Spring 기본 에러 형태로 내려줄 뿐, 구조화된 에러 응답이 없다. `@RestControllerAdvice` 같은 글로벌 에러 핸들러도 존재하지 않는다.

이전에 팀 프로젝트에서 프론트엔드 담당 팀원과 협업할 때도 비슷한 불편함을 느낀 적이 있었다. 어떤 API는 데이터를 바로 주고, 어떤 API는 `{ data: ..., message: ... }` 형태로 감싸서 주니까, 프론트엔드 쪽에서 API마다 응답을 파싱하는 로직이 달라지고, 매번 "이 API는 응답이 어떻게 오나요?"라는 질문이 반복됐다.

### 해결 + 근거
프론트엔드 코드에 방어 로직을 추가하여 즉시 에러를 해소했다(프론트엔드 수정은 AI의 도움을 받았다).

```javascript
// 변경 전
const products = await axios.get('/sell/all').then((res) => res.data);
products.sort((a, b) => new Date(a.finishDate) - new Date(b.finishDate));
getProduct(products);

// 변경 후
const products = await axios.get('/sell/all').then((res) => res.data);
if (Array.isArray(products)) {
  products.sort((a, b) => new Date(a.finishDate) - new Date(b.finishDate));
  getProduct(products);
}
```

하지만 이는 임시 조치이고, 근본적으로는 백엔드에서 통일된 응답 래퍼를 도입하는 것이 필요하다. 예를 들어.

```java
// 통일된 응답 래퍼
public class ApiResponse<T> {
    private boolean success;
    private T data;
    private String error;
}

// 글로벌 에러 핸들러
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(ResponseStatusException.class)
    public ApiResponse<?> handleError(ResponseStatusException e) {
        return ApiResponse.fail(e.getReason());
    }
}
```

이렇게 하면 모든 API가 `{ success, data, error }` 형태로 통일되기 때문에, 프론트엔드에서도 공통 API 호출 모듈을 만들 수 있다.

```javascript
// 프론트엔드 공통 API 모듈
const api = {
  get: async (url) => {
    const res = await axios.get(url);
    if (res.data.success) return res.data.data;
    throw new Error(res.data.error);
  }
};

// 사용처 — API마다 파싱 로직을 다르게 짤 필요가 없어진다
const products = await api.get('/sell/all');  // 항상 배열이 보장됨
```

이번에 직접 프론트엔드를 구현하면서 이 구조의 효과를 체감했다. 백엔드 응답이 통일되어 있으면 프론트엔드에서 위처럼 공통 모듈 하나로 모든 API 호출을 처리할 수 있고, 에러 핸들링도 한 곳에서 관리할 수 있다. 반대로 응답 형태가 제각각이면 API마다 개별적으로 파싱 로직을 작성해야 하고, 그만큼 실수가 발생할 여지가 늘어난다.

### 깨달음
백엔드 개발자로서 API를 설계할 때, "데이터만 잘 내려주면 된다"고 생각하기 쉽다. 하지만 직접 프론트엔드를 만져보니, 응답 형태의 일관성이 프론트엔드 코드의 구조적 품질에 직접적인 영향을 미친다는 것을 깨달았다. 통일된 응답 래퍼가 있으면 프론트엔드는 공통 모듈을 만들어 로직을 깔끔하게 분리할 수 있고, 없으면 API마다 개별 처리 로직이 산재하게 된다. 앞으로 API를 설계할 때는 정상 응답과 에러 응답 모두 일관된 포맷으로 내려주는 것을 기본 원칙으로 삼아야겠다.

---

## 4. WebSocket 연결 실패

### 문제
실시간 검색 랭킹과 주문 알림 기능이 동작하지 않았다.
```
WebSocket connection to 'ws://localhost:3002/ws/search/...' failed.
WebSocket is closed before the connection is established.
```

### 파악 + 근거

이 문제는 단일 원인이 아니라 세 가지 설정 누락이 복합적으로 작용한 결과였다. 요청 흐름(클라이언트 → Nginx → API Gateway → 백엔드)을 한 단계씩 추적하면서 원인을 분리했다.

#### WebSocket은 REST API와 어떻게 다른가

원인을 설명하기 전에, 왜 WebSocket에서만 이런 문제가 발생하는지 이해할 필요가 있다.

일반적인 REST API는 요청-응답(Request-Response) 모델이다. 클라이언트가 요청을 보내면 서버가 응답하고, 연결이 끊어진다. 매 요청이 독립적이고 무상태(Stateless)이다.

반면 WebSocket은 지속적 양방향 연결(Persistent Bidirectional Connection) 이다. 최초에 HTTP로 핸드셰이크를 수행한 뒤 프로토콜을 전환(Upgrade)하여 하나의 TCP 연결을 유지한다. 이 프로젝트에서는 실시간 검색 랭킹(`/topic/rankings`)과 주문 알림(`/topic/orders`)에 WebSocket(STOMP over SockJS)을 사용하고 있다.

이 차이 때문에 REST API는 단순한 HTTP 프록시 설정만으로 동작하지만, WebSocket은 프로토콜 업그레이드 과정을 중간 레이어(Nginx, Gateway)가 모두 인지하고 전달해야 한다. 어느 한 레이어라도 업그레이드를 처리하지 못하면 연결이 실패한다.

```
[ REST API 흐름 ]
Client --HTTP 요청--> Nginx --HTTP 전달--> Gateway --HTTP 전달--> Service
Client <-HTTP 응답--- Nginx <-HTTP 전달--- Gateway <-HTTP 전달--- Service
(연결 종료)

[ WebSocket 흐름 ]
Client --HTTP Upgrade 요청--> Nginx --Upgrade 전달--> Gateway --Upgrade 전달--> Service
Client <-101 Switching-------- Nginx <-101 전달------- Gateway <-101 전달------- Service
Client <====== WebSocket 양방향 연결 유지 (TCP 커넥션 지속) ======> Service
```

#### (1) Nginx에 WebSocket 프록시 설정 누락

`nginx.conf`에 `/api/` 경로만 프록시 설정이 있었고, `/ws/` 경로에 대한 설정이 없었다. WebSocket은 HTTP Upgrade 메커니즘을 통해 프로토콜을 전환하는 방식이므로, Nginx가 Upgrade 헤더를 백엔드로 전달하지 않으면 프로토콜 전환이 이루어지지 않는다.

RFC 6455 (The WebSocket Protocol)에 따르면, 클라이언트는 HTTP 요청에 `Upgrade: websocket` 헤더를 포함하여 보내고, 서버가 `101 Switching Protocols`로 응답하면 WebSocket 프레임으로 통신을 시작한다.

Nginx 공식 문서에서도 WebSocket 프록시 시 Upgrade 헤더 설정을 필수로 명시하고 있다.
> *"For a WebSocket connection, the Upgrade and Connection headers need to be set explicitly."*
> — [Nginx Docs: WebSocket proxying](https://nginx.org/en/docs/http/websocket.html)

#### (2) Spring Cloud Gateway의 WebSocket 라우팅 프로토콜 오류

API Gateway(`application.yml`)에서 WebSocket 경로를 일반 HTTP와 동일한 `lb://`로 라우팅하고 있었다. Spring Cloud Gateway에서 WebSocket을 라우팅하려면 `lb:ws://` 스킴을 사용해야 한다.

> *"To enable websocket routing, add the `lb:ws://` or `lb:wss://` scheme to the uri."*
> — [Spring Cloud Gateway Docs: Websocket Routing Filter](https://docs.spring.io/spring-cloud-gateway/reference/spring-cloud-gateway/configuration.html)

백엔드에서 WebSocket 엔드포인트(`@EnableWebSocketMessageBroker`, STOMP 브로커)를 구현할 때는 정상 동작했기 때문에 코드에 문제가 없다고 판단했다. 하지만 Gateway 라우팅 설정에서 HTTP와 WebSocket을 동일하게 취급한 것이 문제였다. REST API와 달리 WebSocket은 프로토콜 자체가 다르기 때문에, Gateway에서도 별도의 스킴으로 라우팅해야 한다.

#### (3) CORS allowedOrigins에 새 포트 미등록

포트를 3000 → 3002로 변경했지만, API Gateway의 CORS 설정에는 `localhost:3000`만 등록되어 있었다. 브라우저의 동일 출처 정책(Same-Origin Policy)에 따라 포트 번호가 다르면 다른 Origin으로 간주된다.
> *"Two URLs have the same origin if the protocol, port, and host are the same for both."*
> — [MDN: Same-Origin Policy](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy)

### 해결 + 근거

Nginx WebSocket 프록시 추가.
```nginx
location /ws/ {
    resolver 127.0.0.11 valid=30s;
    set $upstream http://api-gateway:8080;
    proxy_pass $upstream/ws/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```
- `proxy_http_version 1.1` : WebSocket은 HTTP/1.1의 Upgrade 메커니즘 기반
- `Upgrade $http_upgrade` : 클라이언트의 프로토콜 업그레이드 요청을 백엔드로 전달
- `Connection "upgrade"` : 커넥션 업그레이드 유지

Spring Cloud Gateway WebSocket 라우트 분리.
```yaml
# 변경 전: HTTP와 WebSocket이 혼재
- id: search-service
  uri: lb://search-service
  predicates.
    - Path=/search/, /ws/search/

# 변경 후: HTTP와 WebSocket을 별도 라우트로 분리
- id: search-service
  uri: lb://search-service
  predicates.
    - Path=/search/

- id: search-service-ws
  uri: lb:ws://search-service
  predicates.
    - Path=/ws/search/
```

동일한 변경을 `order-service`에도 적용했다.

CORS 설정에 3002 포트 추가.
```yaml
allowedOrigins.
  - "http://localhost:3000"
  - "http://localhost:3002"
```

### WebSocket의 실시간 특성과 한계

이번 트러블슈팅을 하면서 WebSocket의 실시간 특성이 갖는 구조적 한계도 함께 정리했다.

이 프로젝트에서는 검색 랭킹을 3가지 방식으로 클라이언트에 푸시하고 있다.
1. 사용자가 검색할 때 즉시 랭킹 갱신 후 전송
2. 60초 주기 스케줄러로 정기 전송 (`@Scheduled(fixedRate = 60000)`)
3. Kafka로 주문 이벤트를 수신하면 랭킹 재계산 후 전송

하지만 WebSocket은 연결이 유지되는 동안만 메시지를 수신할 수 있다. 현재 구조에서 발생할 수 있는 문제와 보완 방향은 다음과 같다.

| 한계 | 현재 상태 | 보완 방향 |
|------|-----------|-----------|
| 연결 끊김 시 메시지 유실 | 클라이언트 재접속 시 5초 간격 재시도(`reconnectDelay: 5000`) | 재접속 시 마지막 랭킹 상태를 REST API로 보완 조회 |
| 서버 장애 시 알림 손실 | 별도 처리 없음 | 메시지 브로커(Redis Pub/Sub, RabbitMQ) 도입으로 메시지 영속화 |
| 접속자 증가 시 서버 부하 | 각 연결이 TCP 커넥션을 점유 | 연결 수 제한, 또는 SSE(Server-Sent Events)로 단방향 전환 검토 |
| 백프레셔 미처리 | 서버가 일방적으로 메시지 전송 | 클라이언트 수신 속도에 따른 전송 조절 로직 필요 |

특히 검색 랭킹처럼 서버→클라이언트 단방향 전송만 필요한 경우, WebSocket 대신 SSE(Server-Sent Events)를 사용하면 연결 관리가 단순해지고 HTTP/2 환경에서 멀티플렉싱의 이점도 얻을 수 있다. 반면 주문 알림처럼 양방향 통신이 필요하거나, SockJS 폴백이 필요한 환경에서는 WebSocket이 적합하다.

### 깨달음
백엔드 개발자로서 WebSocket 엔드포인트를 구현하는 것까지는 익숙했지만, 그 앞단의 인프라 레이어(Nginx 리버스 프록시, API Gateway)에서 WebSocket이 어떻게 라우팅되는지는 깊이 고려하지 못했다.

핵심은 WebSocket은 REST와 프로토콜 자체가 다르다는 점이다. REST는 요청-응답 후 연결이 끊어지기 때문에 중간 프록시가 단순히 HTTP를 전달하면 되지만, WebSocket은 최초 HTTP 핸드셰이크 → 프로토콜 업그레이드 → 지속 연결이라는 과정을 거치므로, 경로상의 모든 레이어가 이 과정을 명시적으로 지원해야 한다.

MSA에서 백엔드 코드가 정상이더라도, 요청이 클라이언트에서 서비스까지 도달하는 전체 네트워크 경로를 이해하지 못하면 장애 원인을 찾을 수 없다. 백엔드 개발자라도 배포 인프라의 동작 방식 — 특히 프록시가 프로토콜별로 어떻게 동작하는지 — 까지 파악하고 있어야 안정적인 서비스 운영이 가능하다.

---

## 최종 구성 요약

### Docker Compose 서비스 목록

| 서비스 | 포트 | 역할 |
|--------|------|------|
| frontend | 3002 | React (Nginx) |
| member-service | 8081 | 회원 관리 |
| product-service | 8082 | 상품 관리 |
| order-service | 8083 | 주문 관리 |
| point-service | 8084 | 포인트 관리 |
| payment-service | 8085 | 결제 관리 |
| search-service | 8086 | 검색 (Elasticsearch) |
| mongodb | 27017 | MongoDB |
| mysql | 3306 | MySQL |
| elasticsearch | 9200 | Elasticsearch |
| redis | 6379 | Redis |
| kafka | 9092 | Kafka |
| zookeeper | 2181 | Zookeeper |

### 전체 재배포 명령어
```bash
# 백엔드 빌드 후 전체 재배포
./gradlew build -x test && docker-compose up --build -d

# 프론트엔드만 재배포
docker-compose up --build -d frontend

# 특정 서비스만 재배포
docker-compose up --build -d payment-service

# 로그 확인
docker-compose logs -f <서비스명>

# 전체 중지
docker-compose down
```
