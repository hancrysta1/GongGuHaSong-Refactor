# Troubleshooting 2 - Docker Compose 프론트엔드 연동 및 실시간 검색

프론트엔드(React)와 백엔드(Spring Boot MSA)를 Docker Compose로 통합 배포한 이후, 실제 서비스를 사용하면서 발생한 이슈와 해결 과정을 기록한다. Troubleshooting 1에서는 초기 배포 과정의 문제를 다뤘다면, 이번에는 서비스 운영 중 발생하는 연동 문제를 다룹니다.

---

## 1. Nginx 301 리다이렉트로 인한 포트 유실

### 문제
프론트엔드에서 검색 API를 호출하면 `http://localhost/search/`(포트 없음)로 요청이 가서 `ERR_CONNECTION_REFUSED` 에러가 발생했다. 브라우저 주소는 `localhost:3002`인데, 실제 요청은 `localhost:80`으로 갔다.

```
GET http://localhost/search/?keyword=니트&userId= net::ERR_CONNECTION_REFUSED
```

### 파악 + 근거

처음에는 React 코드 문제라고 판단했다. axios의 `baseURL`이 잘못 설정되었거나, `sockjs-client` 라이브러리가 `global.location`을 오염시키는 것이 아닌지 의심했다.

시도한 접근들 (모두 실패).
1. `axios.defaults.baseURL = ''` 설정 → 여전히 `localhost:80`으로 감
2. `axios.defaults.baseURL = window.location.origin` 설정 → 여전히 `localhost:80`으로 감
3. SearchBar에서 `axios` 대신 `fetch()` 사용 → 여전히 `localhost:80`으로 감
4. `window.location.origin + '/search'`로 절대 URL 직접 지정 → console.log에는 `localhost:3002`로 찍히는데 실제 요청은 `localhost:80`으로 감
5. Docker 빌드 캐시 삭제 (`--no-cache`) → 변화 없음
6. 서비스 워커 확인 → 없음
7. 시크릿 모드 → 동일 현상

4번 결과가 결정적인 단서였다. JavaScript 코드에서 URL을 `http://localhost:3002/search`로 명시적으로 지정했는데도 브라우저가 `http://localhost/search/`로 요청한다는 것은, 브라우저와 서버 사이에서 리다이렉트가 발생하고 있다는 의미였다.

이를 확인하기 위해 `curl`로 직접 요청을 보냈다.
```bash
curl -s "http://localhost:3002/search?keyword=니트&userId=test" | head -3
```

결과.
```html
<html>
<head><title>301 Moved Permanently</title></head>
<body>
```

301 리다이렉트가 발생하고 있었다. Nginx가 `/search?keyword=니트`를 `/search/`로 리다이렉트하면서, 리다이렉트 URL의 포트가 컨테이너 내부 포트(80)로 생성되고 있었다.

원인은 nginx 설정에 있었다.

```nginx
# 문제가 된 설정
location /search/ {     # ← trailing slash
    proxy_pass $gateway;
}
```

`location /search/`는 `/search/ranking` 같은 경로는 매칭하지만, `/search?keyword=test` 같은 쿼리 파라미터가 붙은 경로는 매칭하지 않는다. Nginx는 이 경우 자동으로 `/search/`로 301 리다이렉트를 생성하는데, 이때 리다이렉트 URL이 내부 포트(80)로 생성된다.

```
요청: GET http://localhost:3002/search?keyword=니트
  ↓ Nginx: location /search/ 에 매칭 안 됨
  ↓ Nginx: 자동 301 Redirect → http://localhost/search/?keyword=니트
  ↓ 브라우저: http://localhost:80/search/ 로 재요청
  ↓ 포트 80에는 아무것도 없음 → ERR_CONNECTION_REFUSED
```

Nginx 공식 문서에서 이 동작을 설명하고 있다.
> *"If a location is defined by a prefix string that ends with the slash character, and requests are processed by proxy_pass, then the special processing is performed. In response to a request with URI equal to this string, but without the trailing slash, a permanent redirect with the code 301 will be returned."*
> — [Nginx Docs: location](https://nginx.org/en/docs/http/ngx_http_core_module.html#location)

이 문제가 특히 찾기 어려웠던 이유는, 다른 API들(`/sell/all`, `/order/all`)은 정상 동작했기 때문이다. 이들은 경로에 하위 path가 있어서 `location /sell/`에 매칭됐지만, `/search?keyword=...`는 쿼리 파라미터만 있고 하위 path가 없어서 매칭에 실패한 것이다.

### 해결 + 근거

두 가지를 수정했다.

1. location에서 trailing slash 제거.
```nginx
# 변경 전
location /search/ { ... }

# 변경 후
location /search { ... }   # trailing slash 없이 — /search?keyword=... 도 매칭
```

2. absolute_redirect off 추가.
```nginx
server {
    listen 80;
    absolute_redirect off;   # 리다이렉트 시 포트 유실 방지
    ...
}
```

`absolute_redirect off`는 Nginx가 리다이렉트 URL을 생성할 때 절대 경로 대신 상대 경로를 사용하도록 한다. 이렇게 하면 설령 리다이렉트가 발생하더라도 포트가 유실되지 않는다.

### 깨달음

이 문제를 해결하는 데 가장 오래 걸렸다. JavaScript 코드를 여러 차례 수정했지만 전혀 효과가 없었고, 심지어 `fetch()`로 바꿔도 안 됐기 때문에 "브라우저 환경 자체에 문제가 있는 건 아닌가"까지 의심했다.

돌이켜보면, 에러 메시지에서 URL의 포트가 빠져있다는 점에 더 일찍 주목했어야 했다. 브라우저 콘솔에서 `http://localhost/search/` (포트 없음, trailing slash 있음)라는 두 가지 단서가 이미 나와 있었는데, 이를 "코드의 baseURL 문제"로만 해석하고 Nginx 리다이렉트 가능성을 늦게 확인한 것이 디버깅 시간을 늘린 원인이었다.

네트워크 문제는 코드보다 먼저 HTTP 레벨에서 확인해야 한다. `curl -v`로 실제 HTTP 응답(301, 302 등)을 직접 확인했다면 훨씬 빠르게 원인을 찾을 수 있었을 것이다. 앞으로 "요청이 이상한 곳으로 간다"는 증상이 나오면, 코드를 수정하기 전에 `curl -v`로 실제 HTTP 응답 상태 코드와 헤더를 먼저 확인하는 습관을 들여야겠다.

---

## 2. API Gateway 503 Service Unavailable (반복 발생)

### 문제
서비스를 재배포할 때마다 1~2분간 모든 API가 503 에러를 반환했다. 프론트엔드에서 접속하면 화면이 비어있고, 콘솔에 503 에러가 쏟아졌다.

```
GET http://localhost:3002/sell/all 503 (Service Unavailable)
GET http://localhost:3002/search/ranking 503 (Service Unavailable)
GET http://localhost:3002/ws/search/info 503 (Service Unavailable)
```

### 파악 + 근거

503 Service Unavailable은 API Gateway가 요청을 받았지만 라우팅할 백엔드 서비스를 찾지 못했다는 의미이다.

Spring Cloud Gateway는 Eureka에서 서비스 목록을 가져와 라우팅하는데, `lb://service-name` 형태의 라우트는 Eureka에 해당 서비스가 등록되어야 동작한다. 서비스를 재배포하면.

1. Docker 컨테이너 재시작
2. Spring Boot 기동 (~10~20초)
3. Eureka 클라이언트가 Eureka 서버에 등록 (~30초)
4. API Gateway가 Eureka에서 서비스 목록을 갱신 (~30초, 기본 캐시 주기)

이 과정이 총 1~2분 소요된다. 그 동안 Gateway는 서비스를 찾지 못해 503을 반환한다.

특히 이 프로젝트에서는 `docker-compose up --build -d frontend`만 실행해도 Gateway가 함께 재시작되는 문제가 있었다. `depends_on`으로 연결된 서비스 체인(frontend → api-gateway → discovery-server)이 있어서, 하나를 재시작하면 연쇄적으로 재시작이 발생했다.

Eureka 등록 상태는 다음 명령어로 확인할 수 있다.
```bash
curl -s http://eureka:eureka@localhost:8761/eureka/apps | grep '<name>'
```

### 해결 + 근거

근본 해결은 어렵다 — Eureka 기반 서비스 디스커버리의 구조적 특성이기 때문이다. 대신 다음과 같이 대응했다.

1. 재배포 후 1~2분 대기 — Eureka 등록이 완료될 때까지 기다림
2. Eureka 등록 상태를 확인한 뒤 테스트 — 모든 서비스가 등록된 것을 확인하고 브라우저 새로고침
3. 프론트엔드에 방어 코드 추가 — API 응답이 비정상일 때 `Array.isArray()` 검사 등으로 크래시 방지

### 깨달음

처음에는 503이 나올 때마다 "뭔가 설정이 잘못된 건 아닌가"라고 생각해서 설정을 수정하고 재배포했는데, 재배포할 때마다 또 503이 나왔다. 결국 "503은 일시적인 상태이며, Eureka 등록이 완료되면 자연히 해소된다"는 것을 이해하는 데 시간이 걸렸다.

이건 MSA에서 Eureka 기반 서비스 디스커버리를 사용할 때의 구조적 한계이다. 서비스가 "떴다"와 "준비됐다"가 다르듯이, "컨테이너가 시작됐다"와 "Eureka에 등록됐다"와 "Gateway 캐시에 반영됐다"는 전부 다른 시점이다. 운영 환경에서는 Rolling Update를 통해 기존 인스턴스를 유지하면서 새 인스턴스가 완전히 준비된 후 교체하는 방식으로 다운타임을 방지한다.

---

## 3. Elasticsearch 연결 실패로 Search-Service 기동 불가

### 문제
Docker Compose로 전체 서비스를 올렸을 때, search-service만 기동에 실패하고 Eureka에 등록되지 않았다.

```
Caused by: java.net.ConnectException: Connection refused
    at org.elasticsearch.client.RestHighLevelClient...
```

### 파악 + 근거

search-service는 기동 시점에 Elasticsearch에 연결하여 인덱스 존재 여부를 확인한다. Spring Data Elasticsearch가 `@Document` 어노테이션이 붙은 엔티티의 인덱스를 자동으로 확인/생성하는 과정이 애플리케이션 시작 시점에 수행되기 때문이다.

Docker Compose에서 `depends_on: elasticsearch`를 설정해두었지만, 이는 Elasticsearch 컨테이너의 시작 순서만 보장할 뿐 Elasticsearch가 실제로 요청을 받을 수 있는 상태인지는 보장하지 않는다. Elasticsearch는 JVM 기반으로 시작하는 데 수십 초가 걸리는데, search-service가 그보다 먼저 기동을 시작하면 연결에 실패한다.

이것은 Troubleshooting 1의 "Nginx upstream resolve 실패"와 동일한 패턴이다 — "시작됨"과 "준비됨"은 다르다.

### 해결 + 근거

즉시 해결: search-service를 수동으로 재시작
```bash
docker-compose restart search-service
```

Elasticsearch가 이미 완전히 기동된 상태에서 search-service를 재시작하면 정상 연결된다.

근본 해결: docker-compose에서 Elasticsearch에 healthcheck를 추가하고, search-service가 healthy 상태에서만 시작하도록 설정해야 한다.
```yaml
elasticsearch.
  healthcheck.
    test: ["CMD-SHELL", "curl -sf http://localhost:9200/_cluster/health || exit 1"]
    interval: 10s
    timeout: 5s
    retries: 10

search-service.
  depends_on.
    elasticsearch.
      condition: service_healthy
```

### 깨달음

Troubleshooting 1에서 "시작됨과 준비됨은 다르다"는 교훈을 얻었음에도 동일한 문제를 다시 겪었다. Nginx → API Gateway 구간에서는 이미 해결했지만, Elasticsearch → search-service 구간에서 같은 패턴이 반복된 것이다.

MSA에서 서비스 간 의존 관계가 있는 모든 구간에서 "상대 서비스가 준비되었는가?"를 확인하는 메커니즘이 필요하다는 것을 다시 한번 체감했다. 단순한 시작 순서 제어(`depends_on`)가 아니라, healthcheck + retry 패턴을 기본으로 적용해야 한다.

---

## 4. Kafka Broker 세션 충돌 (NodeExistsException)

### 문제
Docker를 재시작한 후 Kafka 브로커가 기동에 실패했다.

```
ERROR [KafkaServer id=1] Fatal error during KafkaServer startup.
org.apache.zookeeper.KeeperException$NodeExistsException: KeeperErrorCode = NodeExists
```

### 파악 + 근거

Kafka 브로커는 Zookeeper에 자신의 세션(ephemeral node)을 등록한다. Docker를 비정상 종료(Docker Desktop 강제 종료 등)하면 Zookeeper에 이전 세션의 ephemeral node가 남아있는 상태에서 Kafka가 재시작되고, 새 세션으로 같은 경로(`/brokers/ids/1`)에 등록하려 할 때 이전 세션의 노드가 아직 존재하여 충돌이 발생한다.

```
이전 세션(owner: 72073643034738689) → /brokers/ids/1 등록된 상태
새 세션(owner: 72057595828568065) → /brokers/ids/1 등록 시도 → NodeExists 에러
```

Zookeeper의 ephemeral node는 세션이 만료되면 자동 삭제되지만, 세션 타임아웃(기본 30초) 전에 Kafka가 재시작하면 이전 세션의 노드가 아직 남아있는 것이다.

### 해결 + 근거

```bash
docker-compose restart zookeeper kafka
```

Zookeeper를 먼저 재시작하면 이전 세션이 정리되고, 그 다음 Kafka가 시작하면 정상적으로 브로커를 등록할 수 있다.

깨끗하게 하려면.
```bash
docker-compose down && docker-compose up -d
```

전체를 내렸다 올리면 Zookeeper의 ephemeral node가 모두 정리된 상태에서 시작하므로 충돌이 발생하지 않는다.

### 깨달음

Kafka + Zookeeper는 상태를 가진(stateful) 서비스라서 단순 재시작이 항상 깔끔하지 않다. Docker 환경에서 stateful 서비스를 운영할 때는 volume을 통한 데이터 영속화와 graceful shutdown이 중요하다. `docker-compose stop`(graceful)과 Docker Desktop 강제 종료(ungraceful)의 차이를 인식하고, 개발 중에도 가급적 `docker-compose down`으로 정리한 뒤 다시 올리는 습관이 필요하다.

---

## 5. Elasticsearch 공백 포함 검색어 500 에러

### 문제
"니트", "아이폰" 같은 단일 키워드 검색은 정상이지만, "나이키 에어포스 공구"처럼 공백이 포함된 검색어를 입력하면 500 에러가 발생했다.

```
GET /search?keyword=나이키 에어포스 공구 → 500 Internal Server Error
```

### 파악 + 근거

search-service 로그를 확인했다.
```
InvalidDataAccessApiUsageException.
Cannot constructQuery '*"나이키 에"*'. Use expression or multiple clauses instead.
```

문제는 Elasticsearch 검색에 사용한 `Criteria.contains()` 메서드에 있었다.

```java
// 문제가 된 코드
Criteria criteria = new Criteria("title").contains(keyword)
    .or(new Criteria("info").contains(keyword));
```

`contains()`는 내부적으로 와일드카드 쿼리(`*"키워드"*`)를 생성하는데, 공백이 포함된 문자열에는 이 와일드카드 패턴을 생성할 수 없다. Elasticsearch의 와일드카드 쿼리는 단일 토큰에서만 동작하기 때문이다.

Spring Data Elasticsearch 소스 코드를 보면, `contains()`는 `QueryStringQuery`를 생성하는데, 공백이 포함된 문자열에 와일드카드를 적용하면 유효하지 않은 쿼리가 된다.

### 해결 + 근거

`contains()` 대신 `matches()`를 사용했다.

```java
// 변경 후
Criteria criteria = new Criteria("title").matches(keyword)
    .or(new Criteria("info").matches(keyword));
```

`matches()`는 Elasticsearch의 match query를 생성한다. match query는 검색어를 먼저 분석기(analyzer)를 통해 토큰화한 뒤 검색하기 때문에, 공백이 포함된 문자열도 정상적으로 처리된다.

이 프로젝트에서는 Elasticsearch에 nori 한국어 분석기를 설정해두었으므로, "나이키 에어포스 공구"가 ["나이키", "에어포스", "공구"]로 토큰화되어 각 토큰에 대해 검색이 수행된다. 이는 한국어 검색에서 더 정확한 결과를 반환한다.

### 깨달음

Elasticsearch를 사용할 때 쿼리 타입 선택이 검색 품질에 직접적인 영향을 미친다는 것을 알게 되었다. `contains`(와일드카드)는 단순 부분 문자열 매칭에 가깝고, `matches`(match query)는 분석기를 활용한 자연어 검색에 가깝다. 한국어 검색 환경에서는 nori 분석기와 match query 조합이 적합하며, 와일드카드 쿼리는 영어 자동완성 같은 제한된 용도에서만 사용하는 것이 좋다.

---

## 6. 실시간 검색어에 타이핑 중간 결과가 모두 기록되는 문제

### 문제
검색창에 "나이키"를 입력하면 실시간 인기검색어에 "ㄴ", "나", "나이", "나이키"가 모두 등록되었다. 사용자가 의도한 검색어는 "나이키" 하나인데, 타이핑 중간 과정이 전부 검색 로그로 저장된 것이다.

### 파악 + 근거

SearchBar 프론트엔드 코드에서 `onChange` 이벤트(타이핑할 때마다 발생)에 검색 API를 호출하고 있었고, 백엔드의 `search()` 메서드가 API 호출 시마다 검색 로그를 저장하고 있었다.

```java
// 문제가 된 코드 — 모든 호출에서 로그 저장
public List<SearchDocument> search(String keyword, String userId) {
    SearchLog searchLog = new SearchLog();
    searchLog.setKeyword(keyword);
    searchLogRepository.save(searchLog);   // ← 타이핑 중간 결과도 저장
    // ... 검색 실행
}
```

자동완성(타이핑 중)과 실제 검색(엔터/버튼 클릭)을 구분하지 않아서, 한 번의 검색에 여러 건의 의미 없는 로그가 쌓이고 실시간 랭킹을 오염시키고 있었다.

### 해결 + 근거

자동완성과 검색을 별도 엔드포인트로 분리.

```java
// 자동완성 — 로그 저장 없이 ES 조회만
@GetMapping("/suggest")
public List<SearchDocument> suggest(@RequestParam String keyword) {
    return searchService.search(keyword);  // 로그 저장 안 함
}

// 검색 버튼 클릭 — 로그 저장 + 랭킹 갱신
@GetMapping
public List<SearchDocument> search(@RequestParam String keyword, ...) {
    return searchService.searchAndLog(keyword, userId);  // 로그 저장
}
```

프론트엔드에서도 분리.
- 타이핑 중(`onChange`) → `GET /search/suggest?keyword=...` (로그 없음)
- 검색 버튼 클릭(`onSubmit`) → `GET /search?keyword=...&userId=...` (로그 저장)

### 깨달음

"검색"이라는 하나의 기능 안에 자동완성(조회 목적)과 검색 실행(기록 목적)이라는 서로 다른 의도가 있다는 것을 간과한 것이 원인이었다. API를 설계할 때 클라이언트의 호출 의도에 따라 엔드포인트를 분리하는 것이 중요하다. 하나의 엔드포인트에서 모든 것을 처리하면 편리하지만, 부작용(이 경우 로그 오염)을 제어하기 어려워진다.

---

## 7. 동점 시 실시간 검색어 순위 불안정

### 문제
두 검색어의 검색 횟수가 동일한데 매번 순위가 바뀌었다. "아이폰"(검색 2회)과 "나이키"(검색 2회)가 있으면 새로고침할 때마다 2위와 3위가 뒤바뀌었다.

### 파악 + 근거

랭킹 정렬 코드.
```java
// 문제가 된 코드
rankings.sort((a, b) -> Double.compare(b.getScore(), a.getScore()));
```

점수(`score`)만 비교하고 있어서, 동점인 경우 정렬이 불안정(unstable)했다. Java의 `List.sort()`는 Timsort로 stable sort이긴 하지만, 입력 순서가 `Set`(HashSet)에서 오기 때문에 매번 순서가 달라질 수 있었다.

### 해결 + 근거

다단계 정렬 기준 적용.

```java
rankings.sort((a, b) -> {
    int cmp = Double.compare(b.getScore(), a.getScore());  // 1차: 점수
    if (cmp != 0) return cmp;
    cmp = Long.compare(b.getSearchCount(), a.getSearchCount());  // 2차: 검색 횟수
    if (cmp != 0) return cmp;
    return a.getKeyword().compareTo(b.getKeyword());  // 3차: 키워드 사전순
});
```

동점일 때 검색 횟수로 2차 정렬, 그래도 같으면 키워드 사전순으로 3차 정렬하여 항상 동일한 순서가 보장되도록 했다.

### 깨달음

정렬에서 "같은 값"에 대한 처리를 명시하지 않으면 결과가 비결정적(non-deterministic)이 된다. 특히 사용자에게 노출되는 랭킹처럼 순서가 중요한 데이터에서는 동점 처리 기준을 반드시 명시해야 한다. "같으면 어떻게 할 것인가?"를 항상 고민해야 한다.

---

## 최종 정리

이번 트러블슈팅에서 공통적으로 느낀 것은, 문제의 원인이 내가 작성한 코드가 아닌 인프라 레이어에 있는 경우가 많다는 점이다. Nginx 리다이렉트, Eureka 캐시 갱신 지연, Elasticsearch 기동 순서, Kafka 세션 충돌 — 이 모든 문제는 애플리케이션 코드만 보면 원인을 찾을 수 없다.

MSA 환경에서 백엔드 개발자가 코드만 잘 짜는 것으로는 부족하다. 서비스가 실제로 사용자에게 도달하기까지의 전체 경로 — 브라우저 → Nginx → API Gateway → Eureka → 백엔드 서비스 → DB/ES/Kafka — 를 이해하고, 각 레이어에서 발생할 수 있는 문제를 디버깅할 수 있어야 한다.

가장 큰 교훈: "안 된다"고 느꼈을 때, 코드를 수정하기 전에 `curl -v`로 실제 HTTP 응답을 먼저 확인하자. 대부분의 시간 낭비는 원인을 잘못 짚고 코드를 수정하는 데서 발생했다.
