package GongGuHaSong.search.repository;

import GongGuHaSong.search.domain.SearchLog;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Aggregation;

import java.util.Date;
import java.util.List;

public interface SearchLogRepository extends MongoRepository<SearchLog, String> {
    List<SearchLog> findByKeyword(String keyword);
    long countByKeywordAndSearchedAtAfter(String keyword, Date after);
    List<SearchLog> findBySearchedAtAfter(Date after);
}
