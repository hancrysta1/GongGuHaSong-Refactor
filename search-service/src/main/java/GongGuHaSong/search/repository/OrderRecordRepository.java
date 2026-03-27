package GongGuHaSong.search.repository;

import GongGuHaSong.search.domain.OrderRecord;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Date;
import java.util.List;

public interface OrderRecordRepository extends MongoRepository<OrderRecord, String> {
    List<OrderRecord> findByTitle(String title);
    List<OrderRecord> findByOrderedAtAfter(Date after);
}
