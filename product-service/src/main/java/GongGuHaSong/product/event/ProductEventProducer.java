package GongGuHaSong.product.event;

import GongGuHaSong.product.domain.Sell;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProductEventProducer {

    private final KafkaTemplate<String, ProductEvent> kafkaTemplate;

    public void sendProductEvent(Sell sell, String status) {
        ProductEvent event = new ProductEvent();
        event.setProductId(sell.get_id());
        event.setTitle(sell.getTitle());
        event.setInfo(sell.getInfo());
        event.setCategory(sell.getCategory());
        event.setManagerId(sell.getManagerId());
        event.setPrice(sell.getPrice());
        event.setStock(sell.getStock());
        event.setStartDate(sell.getStartDate());
        event.setFinishDate(sell.getFinishDate());
        event.setMainPhoto(sell.getMainPhoto());
        event.setStatus(status);

        kafkaTemplate.send("product-events", sell.get_id(), event);
        log.info("상품 이벤트 발행: status={}, title={}", status, sell.getTitle());
    }
}
