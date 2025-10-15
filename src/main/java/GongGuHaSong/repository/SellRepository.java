package GongGuHaSong.repository;

import GongGuHaSong.domain.Sell;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;


public interface SellRepository extends MongoRepository<Sell,String> {
    List<Sell> findByTitle(String title);
}
