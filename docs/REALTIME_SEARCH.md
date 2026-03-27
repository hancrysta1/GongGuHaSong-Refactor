# 실시간 검색어 랭킹 구축기

## 1. 목표

공구하송에서 "지금 사람들이 뭘 찾고 있는지"를 실시간으로 보여주는 기능. 네이버 실검, 쿠팡 인기 검색어처럼 검색/주문 이벤트가 발생하면 즉시 랭킹에 반영되고, 접속 중인 모든 사용자에게 동시에 갱신되어야 한다.

---

## 2. Elasticsearch + Nori — 한국어 검색의 문제

### 왜 Elasticsearch인가

MongoDB의 `$text` 인덱스도 검색이 가능하지만, 한국어에서 치명적인 한계가 있다.

```
검색어: "과잠 맞춤 제작"
MongoDB $text: "과잠맞춤제작" → 띄어쓰기 기반 토큰화만 가능
Elasticsearch + Nori: "과잠" + "맞춤" + "제작" → 형태소 단위 분리
```

한국어는 교착어라 조사가 붙고(공구를, 공구에, 공구의), 복합어가 많다(공동구매 → 공동+구매). 단순 띄어쓰기 분리로는 "공동구매"를 검색해도 "공동 구매"를 못 찾는다.

### Nori 형태소 분석기

Elasticsearch에 내장된 한국어 분석기. 은전한닢(mecab-ko) 사전 기반으로.

```
입력: "컴퓨터공학과 과잠 공동구매"
Nori 분석: ["컴퓨터", "공학", "과", "과잠", "공동", "구매"]
```

이렇게 분리되면 "공동구매"로 검색해도 "공동 구매", "공동구매" 모두 매칭된다.

### 적용 방법

```java
// SearchDocument.java — Elasticsearch 인덱스 매핑
@Document(indexName = "products")
public class SearchDocument {
    @Id
    private String id;

    @Field(type = FieldType.Text, analyzer = "nori")  // ← Nori 분석기 지정
    private String title;

    @Field(type = FieldType.Text, analyzer = "nori")
    private String info;

    @Field(type = FieldType.Keyword)   // 카테고리는 정확 매칭 (분석 안 함)
    private String category;
    // ...
}
```

```yaml
# docker-compose.yml — Nori 플러그인 설치
elasticsearch.
  build.
    dockerfile_inline: |
      FROM docker.elastic.co/elasticsearch/elasticsearch:7.17.10
      RUN elasticsearch-plugin install analysis-nori
```

### 트러블슈팅: 띄어쓰기 검색 500 에러

초기에 검색 로직을 `contains()`(와일드카드)로 구현했는데, 띄어쓰기 포함 검색어에서 500 에러가 발생했다.

```java
// Before — 500 에러 발생
Criteria criteria = new Criteria("title").contains(keyword);
// "과잠 맞춤" → 와일드카드 쿼리 → Nori 분석기와 충돌

// After — 정상 동작
Criteria criteria = new Criteria("title").matches(keyword);
// "과잠 맞춤" → match 쿼리 → Nori가 분석한 토큰과 매칭
```

`matches()`는 검색어도 Nori로 분석한 뒤, 역인덱스(Inverted Index)에서 토큰을 매칭한다. 이게 Elasticsearch의 본래 동작 방식이다.

---

## 3. 역인덱스(Inverted Index) — Elasticsearch의 핵심 자료구조

Elasticsearch가 빠른 이유는 역인덱스 때문이다.

### 일반 인덱스 vs 역인덱스

```
[일반 인덱스] Document → 단어
doc1: "버니 키링 공구"
doc2: "과잠 맞춤 제작"
doc3: "스터디 플래너 공구"

→ "공구" 검색 시 모든 document를 순차 스캔해야 함

[역인덱스] 단어 → Document
"버니"   → [doc1]
"키링"   → [doc1]
"공구"   → [doc1, doc3]    ← 바로 찾음!
"과잠"   → [doc2]
"맞춤"   → [doc2]
"제작"   → [doc2]
"스터디" → [doc3]
"플래너" → [doc3]

→ "공구" 검색 시 역인덱스에서 [doc1, doc3] 즉시 반환
```

Nori 분석기가 한국어를 형태소 단위로 분리 → 각 토큰이 역인덱스에 등록 → 검색 시 토큰 매칭으로 O(1)에 가까운 조회.

### 실제 검색 흐름

```
사용자 입력: "키링"
    ↓ Nori 분석
토큰: ["키링"]
    ↓ 역인덱스 조회
매칭 document: [doc1] (버니 키링 공구)
    ↓ 결과 반환
```

---

## 4. 상품 등록 → Elasticsearch 자동 인덱싱

상품이 등록/수정되면 Kafka 이벤트를 통해 search-service에서 자동으로 ES에 인덱싱한다.

```
상품 등록 (product-service)
    ↓ Kafka "product-events" 발행
search-service (ProductEventConsumer)
    ↓ SearchService.indexProduct()
Elasticsearch 인덱스 "products"에 저장
    ↓
이제 검색 가능
```

```java
// ProductEventConsumer.java
@KafkaListener(topics = "product-events", groupId = "search-service-group")
public void handleProductEvent(ProductEvent event) {
    if ("DELETED".equals(event.getStatus())) {
        searchService.removeProduct(event.getProductId());
        return;
    }

    SearchDocument doc = new SearchDocument();
    doc.setId(event.getProductId());
    doc.setTitle(event.getTitle());
    doc.setInfo(event.getInfo());
    doc.setCategory(event.getCategory());
    // ...
    searchService.indexProduct(doc);  // ES에 저장
}
```

---

## 5. 실시간 랭킹 — 이벤트 드리븐 + 폴링 하이브리드

### 랭킹 점수 계산

```
점수 = 검색횟수 × 0.4 + 주문량 × 0.6
집계 범위: 최근 1시간
상위 10개 키워드
```

주문에 가중치를 더 준 이유: 검색만 많이 한 키워드보다, 실제로 구매까지 이어진 키워드가 더 의미 있는 인기 지표이기 때문.

### 실시간 갱신 구조

```
┌─ 이벤트 드리븐 (즉시) ──────────────────────────────────────┐
│                                                              │
│  검색 발생 → searchAndLog() → calculateRankings()            │
│                              → WebSocket push (/topic/rankings) │
│                              → Redis 캐시 갱신                │
│                                                              │
│  주문 확정 → Kafka "order-events"                            │
│           → OrderEventConsumer.handleOrderEvent()            │
│           → searchService.recordOrder()                      │
│           → calculateRankings() → WebSocket push             │
│                                                              │
│  지연: 10~100ms                                              │
└──────────────────────────────────────────────────────────────┘

┌─ 폴링 (60초 주기, 폴백) ────────────────────────────────────┐
│                                                              │
│  RankingScheduler.broadcastRankings()                        │
│  → calculateRankings()                                       │
│  → 이전 랭킹과 비교 (UP/DOWN/NEW/SAME 판정)                 │
│  → WebSocket push                                            │
│                                                              │
│  역할: 이벤트 누락 시 보정, 변동 방향 계산                    │
└──────────────────────────────────────────────────────────────┘
```

왜 두 가지를 섞었는가.
- 이벤트 드리븐만 쓰면: Kafka 이벤트 유실 시 랭킹 멈춤
- 폴링만 쓰면: 최대 60초 지연 → "실시간"이 아님
- 하이브리드: 이벤트로 즉시 갱신 + 60초마다 보정 → 실시간성 + 안정성

### WebSocket (STOMP + SockJS)

```java
// WebSocketConfig.java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {
    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        config.enableSimpleBroker("/topic");  // 구독 경로
    }
    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws/search")    // WebSocket 엔드포인트
                .setAllowedOriginPatterns("*")
                .withSockJS();                 // SockJS 폴백 (IE 호환)
    }
}
```

```javascript
// RealTimeRanking.js (프론트엔드)
const client = new Client({
    webSocketFactory: () => new SockJS('/ws/search'),
    onConnect: () => {
        client.subscribe('/topic/rankings', (message) => {
            setRankings(JSON.parse(message.body));  // 실시간 갱신
        });
    }
});
```

브라우저가 `/ws/search`에 WebSocket 연결 → `/topic/rankings` 구독 → 서버에서 랭킹 변동 시 push → UI 즉시 반영.

### Redis 캐시의 역할

```java
// SearchService.calculateRankings()
public List<SearchRanking> calculateRankings() {
    // MongoDB에서 최근 1시간 검색/주문 집계
    List<SearchLog> recentSearches = searchLogRepository.findBySearchedAtAfter(oneHourAgo);
    List<OrderRecord> recentOrders = orderRecordRepository.findByOrderedAtAfter(oneHourAgo);
    // ... 점수 계산 ...

    // 결과를 Redis에 캐시 (60초 TTL)
    rankingCacheService.cacheRankings(top10);
    return top10;
}
```

Redis 캐시는 REST API로 직접 랭킹을 조회하는 경우의 부하를 줄인다. WebSocket 연결이 안 되는 클라이언트가 폴링으로 `/search/ranking`을 호출할 때 캐시된 결과를 반환. 이벤트가 발생하면 `calculateRankings()`가 캐시도 같이 갱신하므로, 캐시가 실시간성을 해치지 않는다.

### 트러블슈팅: 랭킹 동점 불안정

동점인 키워드의 순위가 매번 바뀌는 문제가 있었다. 정렬 기준을 다단계로 개선.

```java
// Before — 동점 시 순위 불안정
rankings.sort((a, b) -> Double.compare(b.getScore(), a.getScore()));

// After — 안정 정렬
rankings.sort((a, b) -> {
    int cmp = Double.compare(b.getScore(), a.getScore());          // 1차: 점수
    if (cmp != 0) return cmp;
    cmp = Long.compare(b.getSearchCount(), a.getSearchCount());    // 2차: 검색횟수
    if (cmp != 0) return cmp;
    return a.getKeyword().compareTo(b.getKeyword());               // 3차: 사전순 (결정적)
});
```

3차 정렬까지 넣으면 동일 조건에서 항상 같은 순서가 보장된다.

---

## 6. 검색 분리: 자동완성 vs 실제 검색

검색 입력 중 자동완성과, 실제 검색 버튼 클릭을 다른 API로 분리했다.

```
자동완성 (입력 중): GET /search/suggest?keyword=과
  → ES에서 자동완성 결과 조회
  → 검색 로그 저장 안 함 (랭킹에 반영 안 됨)
  → 오타, 미완성 입력이 랭킹을 오염시키지 않음

실제 검색 (버튼 클릭): GET /search?keyword=과잠&userId=user1
  → ES에서 검색 결과 조회
  → 검색 로그 저장 (MongoDB)
  → 즉시 랭킹 재계산 + WebSocket push
```

이렇게 분리한 이유: 자동완성 중 타이핑하는 "과", "과자", "과잠" 같은 중간 입력이 전부 검색 로그로 쌓이면, 랭킹이 무의미한 키워드로 오염된다. 실제로 이 문제를 겪고 분리했다.

---

## 7. 전체 흐름 정리

```
사용자가 "키링" 검색
    ↓
프론트: SearchBar.js → handleSearch()
    ↓ GET /search?keyword=키링&userId=user1
API Gateway → search-service
    ↓
SearchService.searchAndLog("키링", "user1")
    ├── 검색 로그 저장 (MongoDB search_log)
    ├── ES 검색 (Nori 분석 → 역인덱스 매칭)
    ├── 랭킹 재계산 (최근 1시간 검색+주문 집계)
    ├── Redis 캐시 갱신
    └── WebSocket push → /topic/rankings
            ↓
프론트: RealTimeRanking.js (STOMP 구독 중)
    ↓
모든 접속자의 화면에서 랭킹 즉시 갱신
```
