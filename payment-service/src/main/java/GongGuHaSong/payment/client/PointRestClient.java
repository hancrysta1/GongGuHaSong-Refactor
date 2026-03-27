package GongGuHaSong.payment.client;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@Slf4j
@Component
public class PointRestClient {

    private final RestTemplate restTemplate;
    private final String pointServiceUrl;

    public PointRestClient(
            @Value("${point-service.url:http://point-service:8084}") String pointServiceUrl) {
        // K8s Service 로드밸런싱을 위해 매 요청마다 새 TCP 연결
        // kube-proxy는 새 연결 시점에 Pod을 선택하므로, keep-alive 비활성화
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);
        factory.setReadTimeout(10000);
        this.restTemplate = new RestTemplate(factory);
        this.pointServiceUrl = pointServiceUrl;
    }

    private HttpHeaders closeHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setConnection("close");  // keep-alive 비활성화 → 매번 새 연결 → K8s 분배
        return headers;
    }

    public Map getPoint(String userId) {
        try {
            HttpEntity<?> entity = new HttpEntity<>(closeHeaders());
            ResponseEntity<Map> res = restTemplate.exchange(
                pointServiceUrl + "/point/" + userId, HttpMethod.GET, entity, Map.class);
            return res.getBody();
        } catch (Exception e) {
            log.error("포인트 조회 실패: {}", e.getMessage());
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "포인트 서비스 연결 실패");
        }
    }

    public Map usePoints(String userId, int amount, String description) {
        try {
            Map<String, Object> body = Map.of(
                "userId", userId, "amount", amount, "description", description);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, closeHeaders());
            ResponseEntity<Map> res = restTemplate.exchange(
                pointServiceUrl + "/point/use", HttpMethod.POST, entity, Map.class);
            log.info("포인트 차감 완료: userId={}, amount={}", userId, amount);
            return res.getBody();
        } catch (Exception e) {
            log.warn("포인트 사용 실패: {}", e.getMessage());
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "포인트 사용 실패: " + e.getMessage());
        }
    }

    public Map cancelPoints(String userId, int amount, String description) {
        try {
            Map<String, Object> body = Map.of(
                "userId", userId, "amount", amount, "description", description);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, closeHeaders());
            ResponseEntity<Map> res = restTemplate.exchange(
                pointServiceUrl + "/point/cancel", HttpMethod.POST, entity, Map.class);
            return res.getBody();
        } catch (Exception e) {
            log.error("포인트 환불 실패: {}", e.getMessage());
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "포인트 환불 실패");
        }
    }
}
