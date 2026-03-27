package GongGuHaSong.product.repository;

import GongGuHaSong.product.domain.Sell;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface SellRepository extends MongoRepository<Sell, String> {
    List<Sell> findByTitle(String title);
    List<Sell> findByTitleAndManagerId(String title, String managerId);
}
