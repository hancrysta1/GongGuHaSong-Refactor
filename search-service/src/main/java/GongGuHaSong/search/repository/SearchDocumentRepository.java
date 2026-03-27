package GongGuHaSong.search.repository;

import GongGuHaSong.search.domain.SearchDocument;
import org.springframework.data.elasticsearch.repository.ElasticsearchRepository;

import java.util.List;

public interface SearchDocumentRepository extends ElasticsearchRepository<SearchDocument, String> {
    List<SearchDocument> findByTitleContaining(String title);
    List<SearchDocument> findByCategory(String category);
    List<SearchDocument> findByInfoContaining(String info);
}
