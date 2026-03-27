# 다중 인스턴스 & Kubernetes 전환

---

## 1. 왜 K8s로 전환했는가

Docker Compose에서도 인스턴스를 늘리는 것 자체는 어렵지 않다. yml에 `point-service-2`를 추가하면 된다.

하지만 K8s를 쓰는 진짜 이유는 스케일링 편의성이 아니라, 운영에 필요한 기능들이다.

| 기능 | Docker Compose | Kubernetes |
|------|---------------|-----------|
| 스케일링 | yml 추가 (가능) | `kubectl scale` (편할 뿐) |
| 장애 복구 | 컨테이너 죽으면 수동 재시작 | Pod 죽으면 자동 재생성 (self-healing) |
| 자동 스케일링 | 불가능 | CPU 기반 자동 확장 (HPA) |
| 무중단 배포 | 내리고 올리는 동안 중단 | Rolling Update (무중단) |
| 리소스 제한 | 없음 | Pod당 CPU/Memory 제한 |

인스턴스를 늘리는 것만 보면 Docker Compose로 충분하지만, 서비스가 죽었을 때 알아서 살려주고, 트래픽이 몰리면 알아서 늘려주고, 배포할 때 끊김 없이 교체해주는 건 Docker Compose로는 할 수 없다. 그래서 K8s로 전환했다.

---

## 2. K8s 핵심 개념

Pod = 컨테이너 실행 단위. 99%의 경우 Pod 1개 = 컨테이너 1개 = 서비스 인스턴스 1개.

Deployment = "이 Pod을 몇 개 유지해줘"라는 선언. 1대 죽으면 자동으로 새 Pod 생성.

Service = Pod들 앞에 있는 로드밸런서. ClusterIP(가상 대표 IP)를 만들어서, 이 IP로 요청하면 뒤에 있는 Pod들에 분배.

### kube-proxy 분배 원리

```
payment-service가 "http://point-service:8084" 호출
    ↓
K8s DNS: "point-service" → ClusterIP (예: 10.96.0.100)
    ↓
kube-proxy: iptables 규칙으로 패킷 가로채기
    ↓
iptables: 10.96.0.100 → random(Pod1, Pod2, Pod3) 중 하나
    ↓
선택된 Pod의 실제 IP로 전달
```

kube-proxy는 새 TCP 연결마다 Pod을 선택한다. 기존 연결은 같은 Pod으로 유지된다.

### Docker Compose와의 차이

Docker Compose에서는 kube-proxy 같은 분배 주체가 없다. 대신 Eureka + Ribbon이 앱 안에서 분배했다.

```
[Docker Compose + Eureka]
payment-service 안에서:
  Ribbon이 Eureka한테 "point-service 어디?" → "8084, 8184 두 대"
  → Ribbon이 매 요청마다 라운드로빈으로 선택
  → 선택된 인스턴스로 직접 HTTP 요청

[Kubernetes]
payment-service 안에서:
  그냥 "http://point-service:8084"로 요청
  → K8s DNS가 ClusterIP로 변환
  → kube-proxy가 커널에서 Pod 선택
  → 앱은 분배되는지도 모름
```

| | Docker Compose (Eureka) | Kubernetes (kube-proxy) |
|---|---|---|
| 분배 주체 | 앱 안의 Ribbon 라이브러리 | 커널의 iptables |
| 앱에 필요한 것 | eureka-client + @LoadBalanced | 아무것도 없음 |
| 분배 단위 | 요청 단위 (매 HTTP마다 선택) | TCP 연결 단위 (새 연결 시 선택) |
| 인스턴스 목록 | Eureka Server에서 가져옴 | K8s가 알아서 관리 |
| 앱 메모리 비용 | 서비스마다 Eureka Client ~30MB | 0 |

### 이게 왜 중요한가

Docker Compose + Eureka 방식에서는 분배 로직이 앱 안에 있다. 인스턴스가 추가되면 Eureka Server에 등록되고, 각 앱이 목록을 갱신받아야 분배가 시작된다. 인스턴스를 늘리려면 "컨테이너 띄우기 + Eureka 등록 대기(~30초) + 각 앱이 목록 갱신" 과정을 거쳐야 한다. 자동 스케일링이 불가능한 이유가 이것이다. 인스턴스를 자동으로 늘려도, 앱들이 새 인스턴스를 인식하기까지 시간이 걸리고, 그 과정을 자동화할 수 없다.

K8s에서는 분배 로직이 커널(kube-proxy)에 있다. Pod이 생기면 K8s가 iptables 규칙을 즉시 갱신하고, 앱은 아무것도 몰라도 다음 요청부터 새 Pod으로 분배된다. 그래서 HPA(자동 스케일링)가 가능한 것이다. CPU가 70%를 넘으면 K8s가 Pod을 늘리고, iptables가 즉시 갱신되고, 앱 코드 변경 없이 트래픽이 분산된다. 앱 입장에서는 Pod이 1대든 10대든 그냥 `http://point-service:8084`로 요청하면 끝이다.

정리하면, Eureka 방식은 "앱이 직접 챙겨야 하는 구조"이고 K8s는 "인프라가 알아서 하는 구조"이다. 자동 복구(self-healing)도 같은 원리로, Pod이 죽으면 K8s가 새 Pod을 띄우고 iptables를 갱신해서 죽은 Pod으로는 요청이 안 간다. Eureka에서는 죽은 인스턴스가 heartbeat 타임아웃(~90초)이 지나야 목록에서 빠지기 때문에, 그 동안 죽은 인스턴스로 요청이 갈 수 있다.

---

## 3. K8s 스케일 아웃 테스트 결과

point-service를 3대로 스케일 아웃하고, 결제 20건이 분배되는지 확인했다.

### Pod 구성

```
NAME                             READY   STATUS    IP
point-service-5b74887ddc-5n5jq   1/1     Running   10.1.0.17   ← Pod 1
point-service-5b74887ddc-2lkcf   1/1     Running   10.1.0.27   ← Pod 2
point-service-5b74887ddc-bzpkm   1/1     Running   10.1.0.26   ← Pod 3
```

### 트래픽 분배 로그

```
[pod/point-service-5b74887ddc-5n5jq] cache evicted for user: k8s-v3   ← Pod 1
[pod/point-service-5b74887ddc-5n5jq] cache evicted for user: k8s-v3   ← Pod 1
[pod/point-service-5b74887ddc-2lkcf] cache evicted for user: k8s-v3   ← Pod 2
[pod/point-service-5b74887ddc-2lkcf] cache evicted for user: k8s-v3   ← Pod 2
[pod/point-service-5b74887ddc-2lkcf] cache evicted for user: k8s-v3   ← Pod 2
[pod/point-service-5b74887ddc-bzpkm] cache evicted for user: k8s-v3   ← Pod 3
[pod/point-service-5b74887ddc-5n5jq] cache evicted for user: k8s-v3   ← Pod 1
[pod/point-service-5b74887ddc-bzpkm] cache evicted for user: k8s-v3   ← Pod 3
[pod/point-service-5b74887ddc-bzpkm] cache evicted for user: k8s-v3   ← Pod 3
[pod/point-service-5b74887ddc-5n5jq] cache evicted for user: k8s-v3   ← Pod 1
[pod/point-service-5b74887ddc-5n5jq] cache evicted for user: k8s-v3   ← Pod 1
[pod/point-service-5b74887ddc-bzpkm] cache evicted for user: k8s-v3   ← Pod 3
[pod/point-service-5b74887ddc-2lkcf] cache evicted for user: k8s-v3   ← Pod 2
...
```

| Pod | 처리 건수 |
|-----|:--------:|
| Pod 1 (5n5jq) | 5건 |
| Pod 2 (2lkcf) | 9건 |
| Pod 3 (bzpkm) | 6건 |
| 합계 | 20건 |

잔액: 10,000P - 20 × 100P = 8,000P. 마이너스 잔액 없음.
MySQL `SELECT FOR UPDATE`가 3대 인스턴스에서도 정상 동작. DB 레벨 락이라 인스턴스 수와 무관.

---

## 4. 트러블슈팅 — HTTP Keep-Alive 분배 문제

처음에는 3대를 띄웠는데 1대로만 트래픽이 몰렸다.

원인: Java RestTemplate의 HTTP Keep-Alive가 TCP 연결을 재사용. kube-proxy는 새 연결에서만 Pod을 선택하므로, 연결이 유지되면 같은 Pod에 고착.

```
1차 시도: @LoadBalanced 제거 → 실패 (Eureka 문제가 아니었음)
2차 시도: 원인 분석 — kube-proxy는 TCP 연결 단위로 분배
3차 시도: Connection: close 헤더 → 매 요청 새 연결 → 3대 분배 성공
```

상세 과정은 [TROUBLESHOOTING3.md](TROUBLESHOOTING3.md) 참고.

---

## 5. Eureka 제거

K8s 환경에서 Eureka의 3가지 기능(서비스 디스커버리, 로드밸런싱, 헬스체크)이 전부 K8s와 중복이었다. 제거했다.

### FeignClient — Eureka 없이 동작시키기

FeignClient는 Eureka를 통해 인스턴스 목록을 가져오기 때문에, Eureka가 없으면 서비스를 찾을 수 없다. `url` 파라미터로 K8s Service DNS를 직접 지정하여 해결했다.

```java
// Before — Eureka에 의존
@FeignClient(name = "product-service")

// After — K8s Service DNS 직접 지정
@FeignClient(name = "product-service", url = "${product-service.url:http://product-service:8082}")
```

### 제거한 것

| 항목 | 파일 수 |
|------|:-------:|
| `@EnableEurekaClient` 어노테이션 제거 | 6개 서비스 |
| eureka-client 의존성 제거 | 6개 build.gradle |
| eureka 설정 제거 | 6개 application.yml |
| discovery-server 삭제 | 폴더, docker-compose, k8s |
| API Gateway 삭제 | 폴더, docker-compose, k8s |
| FeignClient에 `url` 추가 | 1개 |

앱 코드에서 Spring Cloud(Eureka, Gateway) 의존을 제거하고, 서비스 디스커버리와 로드밸런싱을 K8s 네이티브로 전환했다.

---

## 6. 마무리

K8s 전환, Eureka 제거, 트러블슈팅 전 과정에서 AI의 도움을 많이 받았다. 다만 "우리 서비스에 K8s가 필요한가", "Eureka를 빼야 하는가" 같은 판단은 서비스 상황을 이해한 상태에서 내려야 했고, 결과를 검증하는 것도 직접 로그와 수치를 확인하며 진행했다.

이 과정을 거쳐 단순히 "서비스를 띄우는" 수준을 넘어서, 자동 복구/자동 분배/무중단 배포가 가능한 대용량 트래픽에 강한 설계를 경험할 수 있었다.

실제 부하 테스트(k6, Chaos Engineering)로 SAGA 보상 트랜잭션과 동시성 제어를 정량적으로 검증한 과정은 [PAYMENT_TROUBLESHOOTING.md](PAYMENT_TROUBLESHOOTING.md)에 정리했다.
