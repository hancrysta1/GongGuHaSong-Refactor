package GongGuHaSong.order.service;

import GongGuHaSong.order.web.dto.OrderEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class OrderEventProducer {

    private final KafkaTemplate<String, OrderEvent> kafkaTemplate;

    public void sendOrderEvent(OrderEvent event) {
        kafkaTemplate.send("order-events", event.getTitle(), event);
        log.info("주문 이벤트 발행: title={}, userId={}, quantity={}",
            event.getTitle(), event.getUserId(), event.getQuantity());
    }
}
