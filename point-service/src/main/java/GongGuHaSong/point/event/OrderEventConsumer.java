package GongGuHaSong.point.event;

import GongGuHaSong.point.service.PointService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class OrderEventConsumer {

    private final PointService pointService;

    @KafkaListener(topics = "order-events", groupId = "point-service-group")
    public void handleOrderEvent(OrderEvent event) {
        if (!"CONFIRMED".equals(event.getStatus())) {
            return;
        }

        try {
            int points = event.getQuantity() * 100;
            pointService.earnPoints(
                event.getUserId(),
                points,
                event.getTitle() + " 주문 포인트 적립"
            );
            log.info("포인트 적립 완료: userId={}, points={}", event.getUserId(), points);
        } catch (Exception e) {
            log.error("포인트 적립 실패: userId={}, error={}", event.getUserId(), e.getMessage());
        }
    }
}
