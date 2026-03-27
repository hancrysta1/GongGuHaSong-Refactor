package GongGuHaSong.search.web;

import GongGuHaSong.search.domain.SearchDocument;
import GongGuHaSong.search.domain.SearchRanking;
import GongGuHaSong.search.service.SearchService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RequiredArgsConstructor
@RestController
@RequestMapping("/search")
public class SearchController {

    private final SearchService searchService;

    /**
     * 자동완성용 — 타이핑할 때마다 호출, 검색 로그 저장 안 함
     */
    @GetMapping("/suggest")
    public List<SearchDocument> suggest(@RequestParam String keyword) {
        return searchService.search(keyword);
    }

    /**
     * 검색 버튼 클릭 시 — 검색 로그 저장 + 실시간 랭킹 반영
     */
    @GetMapping
    public List<SearchDocument> search(@RequestParam String keyword,
                                        @RequestParam(required = false, defaultValue = "") String userId) {
        return searchService.searchAndLog(keyword, userId);
    }

    @GetMapping("/category/{category}")
    public List<SearchDocument> searchByCategory(@PathVariable String category) {
        return searchService.searchByCategory(category);
    }

    @GetMapping("/ranking")
    public List<SearchRanking> getRankings() {
        return searchService.getCachedOrCalculateRankings();
    }

    @PostMapping("/index")
    public void indexProduct(@RequestBody SearchDocument document) {
        searchService.indexProduct(document);
    }

    @DeleteMapping("/index/{id}")
    public void removeProduct(@PathVariable String id) {
        searchService.removeProduct(id);
    }

}
