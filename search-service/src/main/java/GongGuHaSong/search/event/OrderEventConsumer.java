package GongGuHaSong.search.event;

import GongGuHaSong.search.domain.SearchRanking;
import GongGuHaSong.search.service.SearchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class OrderEventConsumer {

    private final SearchService searchService;
    private final SimpMessagingTemplate messagingTemplate;

    @KafkaListener(topics = "order-events", groupId = "search-service-group",
        properties = {
            "spring.json.value.default.type=GongGuHaSong.search.event.OrderEvent",
            "spring.json.use.type.headers=false"
        })
    public void handleOrderEvent(OrderEvent event) {
        if (!"CONFIRMED".equals(event.getStatus())) {
            return;
        }

        try {
            // 주문 기록 저장
            searchService.recordOrder(event.getTitle(), event.getQuantity());

            // 즉시 랭킹 재계산 + WebSocket 푸시 (이벤트 드리븐 실시간)
            List<SearchRanking> rankings = searchService.calculateRankings();
            messagingTemplate.convertAndSend("/topic/rankings", rankings);

            log.info("주문 이벤트 처리 완료 → 랭킹 즉시 갱신: title={}", event.getTitle());
        } catch (Exception e) {
            log.error("검색 서비스 주문 이벤트 처리 실패: {}", e.getMessage());
        }
    }
}
