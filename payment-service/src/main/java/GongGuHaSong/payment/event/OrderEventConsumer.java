package GongGuHaSong.payment.event;

import GongGuHaSong.payment.service.PaymentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class OrderEventConsumer {

    private final PaymentService paymentService;

    @KafkaListener(topics = "order-events", groupId = "payment-service-group")
    public void handleOrderEvent(OrderEvent event) {
        if (!"CONFIRMED".equals(event.getStatus())) {
            return;
        }

        try {
            // 주문 확정 시 재고 예약 자동 생성
            paymentService.reserveStock(
                event.getOrderId(),
                event.getTitle(),
                event.getUserId(),
                event.getQuantity()
            );
            log.info("재고 예약 생성: title={}, quantity={}", event.getTitle(), event.getQuantity());
        } catch (Exception e) {
            log.error("재고 예약 실패: title={}, error={}", event.getTitle(), e.getMessage());
        }
    }
}
