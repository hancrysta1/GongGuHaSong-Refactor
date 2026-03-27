package GongGuHaSong.product.repository;

import GongGuHaSong.product.domain.Survey;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface SurveyRepository extends MongoRepository<Survey, String> {
    List<Survey> findByTitle(String title);
}
