package GongGuHaSong.payment.client;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

@Slf4j
@Component
public class ProductRestClient {

    private final RestTemplate restTemplate;
    private final String productServiceUrl;

    public ProductRestClient(
            @Value("${product-service.url:http://product-service:8082}") String productServiceUrl) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);
        factory.setReadTimeout(10000);
        this.restTemplate = new RestTemplate(factory);
        this.productServiceUrl = productServiceUrl;
    }

    public void restoreStock(String productId, int amount) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setConnection("close");
            HttpEntity<?> entity = new HttpEntity<>(headers);
            restTemplate.exchange(
                productServiceUrl + "/sell/" + productId + "/stock/restore?amount=" + amount,
                HttpMethod.POST, entity, String.class);
            log.info("재고 복구 완료: productId={}, amount={}", productId, amount);
        } catch (Exception e) {
            log.error("재고 복구 실패: productId={}, amount={}, error={}", productId, amount, e.getMessage());
        }
    }
}
