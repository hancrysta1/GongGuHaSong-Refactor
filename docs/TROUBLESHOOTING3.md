# Troubleshooting 3 — Kubernetes 전환 과정 기록

> **참고**: K8s는 단일 노드 환경에서 핵심 가치가 성립하지 않아 최종적으로 제거했다. 도입과 제거의 판단 과정은 [MULTI_INSTANCE.md](MULTI_INSTANCE.md)에 정리했다. 이 문서는 K8s 전환 과정에서 겪은 트러블슈팅을 기록으로 남긴 것이다.

Docker Compose → Kubernetes 전환 과정에서 발생한 이슈와 해결 과정을 기록한다.

---

## 이슈 1: Kafka CrashLoopBackOff — K8s 환경변수 충돌

### 증상

Kafka Pod이 기동 즉시 종료되며 CrashLoopBackOff 반복.

```
$ kubectl get pods -l app=kafka
NAME                     READY   STATUS             RESTARTS
kafka-5579b95d59-cxlwp   0/1     CrashLoopBackOff   6
```

로그에는 한 줄만 출력.
```
port is deprecated. Please use KAFKA_ADVERTISED_LISTENERS instead.
```

### 원인

K8s의 Service 환경변수 자동 주입이 원인이었다.

K8s는 같은 namespace에 있는 Service의 이름을 기반으로 환경변수를 자동 주입한다. Service 이름이 `kafka`이면.

```
KAFKA_SERVICE_HOST=10.104.xxx.xxx
KAFKA_SERVICE_PORT=9092
KAFKA_PORT=tcp://10.104.xxx.xxx:9092
KAFKA_PORT_9092_TCP=tcp://...
```

Confluent Kafka 이미지는 `KAFKA_` 접두사 환경변수를 전부 Kafka 설정으로 인식한다. K8s가 주입한 `KAFKA_PORT`를 설정값으로 읽으면서 `port is deprecated` 에러가 발생한 것.

Docker Compose에서는 이런 자동 주입이 없어서 문제가 안 됐다.

### 해결

Pod spec에 `enableServiceLinks: false`를 추가하여 K8s의 Service 환경변수 자동 주입을 비활성화.

```yaml
spec.
  enableServiceLinks: false   # K8s Service 환경변수 자동 주입 차단
  containers.
    - name: kafka
      image: confluentinc/cp-kafka:7.4.0
      env.
        - name: KAFKA_LISTENERS
          value: "PLAINTEXT://0.0.0.0:9092"
        - name: KAFKA_ADVERTISED_LISTENERS
          value: "PLAINTEXT://kafka:9092"
        # ...
```

### 깨달음

Docker Compose에서 잘 되던 컨테이너가 K8s에서 안 되는 이유 중 하나. K8s는 Service 이름 기반으로 환경변수를 주입하기 때문에, 컨테이너가 특정 접두사(KAFKA_, REDIS_, MONGO_ 등)로 시작하는 환경변수를 설정으로 인식하는 경우 충돌이 발생할 수 있다. Docker Compose → K8s 전환 시 반드시 체크해야 할 포인트.

---

## 이슈 2: port-forward가 특정 Pod에만 연결되는 문제

### 증상

point-service를 3대로 스케일 아웃한 뒤, `kubectl port-forward`로 요청을 보냈더니 3대 중 1대에만 모든 트래픽이 몰렸다.

```
# 로그: 전부 같은 Pod에서 처리됨
[pod/point-service-5b74887ddc-5n5jq] cache evicted for user: k8s-scale
[pod/point-service-5b74887ddc-5n5jq] cache evicted for user: k8s-scale
[pod/point-service-5b74887ddc-5n5jq] cache evicted for user: k8s-scale
```

### 원인

`kubectl port-forward`는 로드밸런싱이 아니다. 특정 Pod 또는 Service 뒤의 임의의 1개 Pod에 고정 연결된다. K8s 공식 문서에도.

> "kubectl port-forward allows using resource name, such as a service name, to select a matching pod to port forward to. It does not do load balancing."

즉 `kubectl port-forward svc/point-service 8084:8084`를 해도 3대 중 1대에만 고정 연결된다.

### 해결

직접 point-service에 port-forward하는 대신, payment-service를 경유하도록 변경.

```
클라이언트 → port-forward → payment-service
                                  ↓
                         @LoadBalanced RestTemplate
                                  ↓
                         K8s Service (point-service)
                                  ↓
                    3대 Pod에 라운드로빈 분배
```

payment-service의 `PointRestClient`가 `@LoadBalanced` RestTemplate으로 `http://point-service`를 호출하면, K8s Service가 kube-proxy를 통해 3대 Pod에 분배한다.

```java
@Bean
@LoadBalanced
public RestTemplate loadBalancedRestTemplate() {
    return new RestTemplate();
}

// http://point-service → K8s Service DNS → 3대 Pod에 분배
private static final String POINT_SERVICE_URL = "http://point-service";
```

### 깨달음

`kubectl port-forward`는 디버깅/개발용이지 프로덕션 로드밸런싱 수단이 아니다. 실제 트래픽 분배를 테스트하려면.
- 서비스 간 호출: `@LoadBalanced` RestTemplate 또는 K8s Service DNS
- 외부 접근: Ingress Controller (nginx-ingress) 또는 NodePort/LoadBalancer Service

---

## 이슈 3: Elasticsearch Nori 플러그인 미설치

### 증상

search-service Pod이 CrashLoopBackOff. Elasticsearch에 연결은 되지만, Nori 분석기를 사용하는 인덱스 매핑에서 실패.

### 원인

Docker Compose에서는 `dockerfile_inline`으로 Nori 플러그인을 설치한 커스텀 이미지를 빌드했지만, K8s에서는 공식 ES 이미지를 그대로 사용해서 Nori 플러그인이 없음.

```yaml
# Docker Compose — 커스텀 빌드로 Nori 설치
elasticsearch.
  build.
    dockerfile_inline: |
      FROM docker.elastic.co/elasticsearch/elasticsearch:7.17.10
      RUN elasticsearch-plugin install analysis-nori

# K8s — 공식 이미지 그대로 (Nori 없음)
containers.
  - image: docker.elastic.co/elasticsearch/elasticsearch:7.17.10
```

### 해결

K8s에서도 Nori 플러그인이 설치된 커스텀 이미지를 사용하거나, initContainer로 플러그인을 설치.

```yaml
initContainers.
  - name: install-nori
    image: docker.elastic.co/elasticsearch/elasticsearch:7.17.10
    command: ["sh", "-c", "elasticsearch-plugin install analysis-nori"]
```

또는 Docker Compose에서 빌드한 커스텀 이미지를 K8s에서 참조.
```yaml
containers.
  - image: gongguhasong-main-elasticsearch  # Docker Compose에서 빌드한 이미지
    imagePullPolicy: Never
```

---

## 이슈 4: K8s Service 로드밸런싱이 안 되는 문제 — HTTP Keep-Alive

### 증상

point-service를 3대로 스케일 아웃하고, payment-service에서 `http://point-service:8084`로 호출했는데 20건 전부 같은 Pod 1대로만 갔다.

```
[pod/point-service-5b74887ddc-5n5jq] cache evicted for user: k8s-v2   ← 전부 같은 Pod
[pod/point-service-5b74887ddc-5n5jq] cache evicted for user: k8s-v2
[pod/point-service-5b74887ddc-5n5jq] cache evicted for user: k8s-v2
... (20건 전부 5n5jq)
```

K8s Service는 자동 분배해준다고 했는데 왜?

### 1차 시도: @LoadBalanced 제거

처음에는 Eureka `@LoadBalanced` RestTemplate 때문에 Eureka가 인스턴스를 캐싱해서 한 대에 고착되는 거라고 판단했다. K8s 환경이니까 `@LoadBalanced`를 제거하고 K8s Service DNS로 직접 호출하도록 변경.

```java
// Before: Eureka 클라이언트 사이드 로드밸런싱
@Bean
@LoadBalanced
public RestTemplate loadBalancedRestTemplate() { ... }
private static final String URL = "http://point-service";

// After: K8s Service DNS 직접 호출
this.restTemplate = new RestTemplate();
private static final String URL = "http://point-service:8084";
```

결과: 여전히 1대로만 감. Eureka 문제가 아니었다.

### 2차 시도: 원인 분석 — HTTP Keep-Alive

K8s kube-proxy의 분배 방식을 조사해보니.

> kube-proxy는 새 TCP 연결이 생성될 때 iptables 규칙으로 Pod을 선택한다. 기존 연결에서 오는 패킷은 같은 Pod으로 계속 간다.

Java의 `HttpURLConnection`(RestTemplate 기본)은 HTTP Keep-Alive가 기본 활성화되어 있다. 첫 요청에서 TCP 연결이 생기면, 이후 요청들은 같은 TCP 연결을 재사용한다. kube-proxy 입장에서는 "새 연결이 안 생기니까" 계속 같은 Pod으로 보내는 것.

```
[문제 흐름]
요청 1 → 새 TCP 연결 → kube-proxy가 Pod 1 선택 → 응답 (연결 유지)
요청 2 → 기존 연결 재사용 → Pod 1로 또 감 (kube-proxy 관여 안 함)
요청 3 → 기존 연결 재사용 → Pod 1로 또 감
... 20건 전부 Pod 1
```

### 3차 시도: Connection: close 헤더

매 요청마다 TCP 연결을 닫으면 다음 요청에서 새 연결이 생기고, kube-proxy가 다시 Pod을 선택한다.

```java
private HttpHeaders closeHeaders() {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.setConnection("close");  // keep-alive 비활성화 → 매 요청 새 연결
    return headers;
}

// 모든 요청에 Connection: close 헤더 적용
HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, closeHeaders());
restTemplate.exchange(url, HttpMethod.POST, entity, Map.class);
```

```
[해결 후 흐름]
요청 1 → 새 TCP 연결 → kube-proxy가 Pod 1 선택 → 응답 → 연결 종료
요청 2 → 새 TCP 연결 → kube-proxy가 Pod 3 선택 → 응답 → 연결 종료
요청 3 → 새 TCP 연결 → kube-proxy가 Pod 2 선택 → 응답 → 연결 종료
... 3대에 분배
```

### 깨달음

Docker Compose에서는 Eureka `@LoadBalanced`가 애플리케이션 레벨에서 라운드로빈을 해줬기 때문에, HTTP Keep-Alive와 무관하게 분배됐다. K8s에서는 kube-proxy가 네트워크 레벨(iptables)에서 분배하기 때문에, TCP 연결 단위로 동작한다.

같은 코드가 인프라(Docker Compose vs K8s)에 따라 다르게 동작하는 사례. K8s에서 서비스 간 로드밸런싱이 안 되면 HTTP Keep-Alive를 의심해야 한다.

| 환경 | 로드밸런싱 주체 | 분배 단위 | Keep-Alive 영향 |
|------|---------------|----------|---------------|
| Docker Compose + Eureka | Ribbon (앱 레벨) | 요청 단위 | 없음 (앱이 매 요청마다 선택) |
| Kubernetes | kube-proxy (네트워크 레벨) | TCP 연결 단위 | 있음 (연결 재사용 시 고착) |

> 참고: 프로덕션에서는 Istio 같은 서비스 메시를 쓰면 요청 단위 로드밸런싱이 가능하다. 서비스 메시는 사이드카 프록시가 앱 레벨에서 분배하기 때문.
