package GongGuHaSong.order.web;

import GongGuHaSong.order.client.ProductServiceClient;
import GongGuHaSong.order.domain.Registration;
import GongGuHaSong.order.repository.RegistrationRepository;
import GongGuHaSong.order.service.OrderEventProducer;
import GongGuHaSong.order.web.dto.OrderEvent;
import GongGuHaSong.order.web.dto.RegistrationSaveDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

@Slf4j
@RequiredArgsConstructor
@RestController
public class RegistrationController {

    private final RegistrationRepository registrationRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final OrderEventProducer orderEventProducer;
    private final ProductServiceClient productServiceClient;

    @GetMapping("/order")
    public List<Registration> findAll(@RequestParam String title) {
        return registrationRepository.findByTitle(title);
    }

    @GetMapping("/order/all")
    public List<Registration> findAll() {
        return registrationRepository.findAll();
    }

    @GetMapping("/order/count")
    public int count(@RequestParam String title) {
        List<Registration> registrationList = registrationRepository.findByTitle(title);
        int total = 0;
        for (Registration r : registrationList) {
            total += r.getTotal_Count();
        }
        return total;
    }

    @PostMapping("/order")
    public Registration save(@RequestBody RegistrationSaveDto dto, @RequestParam String title) {
        // 재고 확인
        List<Map<String, Object>> products = productServiceClient.findByTitle(title);
        if (products.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "상품을 찾을 수 없습니다.");
        }

        Map<String, Object> product = products.get(0);
        int stock = ((Number) product.get("stock")).intValue();
        String productId = (String) product.get("_id");

        if (stock < dto.getTotal_Count()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "재고가 부족합니다");
        }

        // 주문 저장
        Registration registration = registrationRepository.save(dto.toEntity(title));

        // 재고 차감
        productServiceClient.decrementStock(productId, dto.getTotal_Count());

        // Kafka 이벤트 발행 (포인트 적립, 검색 랭킹, 재고 동기화를 각 서비스가 구독)
        OrderEvent event = new OrderEvent(
            registration.get_id(),
            title,
            registration.getUserId(),
            registration.getTotal_Count(),
            "CONFIRMED",
            new Date()
        );
        orderEventProducer.sendOrderEvent(event);

        // WebSocket으로 클라이언트에 실시간 알림
        messagingTemplate.convertAndSend("/topic/orders", event);
        messagingTemplate.convertAndSend("/topic/orders/" + title, event);

        return registration;
    }
}
