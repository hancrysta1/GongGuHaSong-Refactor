package GongGuHaSong.product.event;

import GongGuHaSong.product.service.ProductCacheService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class OrderEventConsumer {

    private final ProductCacheService productCacheService;

    @KafkaListener(topics = "order-events", groupId = "product-service-group")
    public void consumeOrderEvent(OrderEvent event) {
        log.info("Received order event: orderId={}, title={}, status={}", event.getOrderId(), event.getTitle(), event.getStatus());

        if ("CONFIRMED".equals(event.getStatus())) {
            productCacheService.incrementOrderCount(event.getTitle(), event.getQuantity());
            log.info("Redis cache updated: product:order-count:{} incremented by {}", event.getTitle(), event.getQuantity());
        }
    }
}
