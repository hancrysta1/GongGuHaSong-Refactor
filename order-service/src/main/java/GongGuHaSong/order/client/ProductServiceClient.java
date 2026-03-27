package GongGuHaSong.order.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;
import java.util.Map;

@FeignClient(name = "product-service", url = "${product-service.url:http://product-service:8082}")
public interface ProductServiceClient {

    @GetMapping("/sell")
    List<Map<String, Object>> findByTitle(@RequestParam("title") String title);

    @PostMapping("/sell/{id}/stock")
    Map<String, Object> decrementStock(@PathVariable("id") String id, @RequestParam("amount") int amount);
}
