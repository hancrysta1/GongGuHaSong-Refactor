package GongGuHaSong.search.event;

import GongGuHaSong.search.domain.SearchDocument;
import GongGuHaSong.search.service.SearchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class ProductEventConsumer {

    private final SearchService searchService;

    @KafkaListener(topics = "product-events", groupId = "search-service-group",
        properties = {
            "spring.json.value.default.type=GongGuHaSong.search.event.ProductEvent",
            "spring.json.use.type.headers=false"
        })
    public void handleProductEvent(ProductEvent event) {
        try {
            if ("DELETED".equals(event.getStatus())) {
                searchService.removeProduct(event.getProductId());
                log.info("ES 상품 삭제: id={}", event.getProductId());
                return;
            }

            SearchDocument doc = new SearchDocument();
            doc.setId(event.getProductId());
            doc.setTitle(event.getTitle());
            doc.setInfo(event.getInfo());
            doc.setCategory(event.getCategory());
            doc.setManagerId(event.getManagerId());
            doc.setPrice(event.getPrice());
            doc.setStock(event.getStock());
            doc.setStartDate(event.getStartDate());
            doc.setFinishDate(event.getFinishDate());
            doc.setMainPhoto(event.getMainPhoto());

            searchService.indexProduct(doc);
            log.info("ES 상품 인덱싱: status={}, title={}", event.getStatus(), event.getTitle());
        } catch (Exception e) {
            log.error("상품 이벤트 처리 실패: {}", e.getMessage());
        }
    }
}
