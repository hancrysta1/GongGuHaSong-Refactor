package GongGuHaSong.search.service;

import GongGuHaSong.search.domain.*;
import GongGuHaSong.search.repository.OrderRecordRepository;
import GongGuHaSong.search.repository.SearchDocumentRepository;
import GongGuHaSong.search.repository.SearchLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.data.elasticsearch.core.SearchHit;
import org.springframework.data.elasticsearch.core.SearchHits;
import org.springframework.data.elasticsearch.core.query.Criteria;
import org.springframework.data.elasticsearch.core.query.CriteriaQuery;
import org.springframework.data.elasticsearch.core.query.Query;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class SearchService {

    private final SearchDocumentRepository searchDocumentRepository;
    private final SearchLogRepository searchLogRepository;
    private final OrderRecordRepository orderRecordRepository;
    private final ElasticsearchOperations elasticsearchOperations;
    private final SimpMessagingTemplate messagingTemplate;
    private final RankingCacheService rankingCacheService;

    /**
     * 자동완성용 검색 — 로그 저장 없이 ES 조회만
     */
    public List<SearchDocument> search(String keyword) {
        Criteria criteria = new Criteria("title").matches(keyword)
            .or(new Criteria("info").matches(keyword));
        Query query = new CriteriaQuery(criteria);
        SearchHits<SearchDocument> hits = elasticsearchOperations.search(query, SearchDocument.class);

        return hits.getSearchHits().stream()
            .map(SearchHit::getContent)
            .collect(Collectors.toList());
    }

    /**
     * 검색 버튼 클릭 시 — 로그 저장 + 랭킹 갱신 + ES 조회
     */
    public List<SearchDocument> searchAndLog(String keyword, String userId) {
        // 검색 로그 저장
        SearchLog searchLog = new SearchLog();
        searchLog.setKeyword(keyword);
        searchLog.setUserId(userId);
        searchLog.setSearchedAt(new Date());
        searchLogRepository.save(searchLog);

        // 검색 즉시 랭킹 재계산 및 WebSocket push
        try {
            List<SearchRanking> rankings = calculateRankings();
            messagingTemplate.convertAndSend("/topic/rankings", rankings);
        } catch (Exception e) {
            log.warn("검색 후 랭킹 갱신 실패: {}", e.getMessage());
        }

        return search(keyword);
    }

    public List<SearchDocument> searchByCategory(String category) {
        return searchDocumentRepository.findByCategory(category);
    }

    public void indexProduct(SearchDocument document) {
        searchDocumentRepository.save(document);
    }

    public void removeProduct(String id) {
        searchDocumentRepository.deleteById(id);
    }

    public void recordOrder(String title, int count) {
        OrderRecord record = new OrderRecord();
        record.setTitle(title);
        record.setCount(count);
        record.setOrderedAt(new Date());
        orderRecordRepository.save(record);
    }

    /**
     * Redis 캐시 우선 조회, 없으면 계산 후 캐시
     */
    public List<SearchRanking> getCachedOrCalculateRankings() {
        List<SearchRanking> cached = rankingCacheService.getCachedRankings();
        if (cached != null) {
            log.debug("Rankings served from Redis cache");
            return cached;
        }
        return calculateRankings();
    }

    /**
     * 실시간 검색 순위 계산 (검색 횟수 + 주문량 기반)
     * 최근 1시간 기준으로 집계
     */
    public List<SearchRanking> calculateRankings() {
        Calendar cal = Calendar.getInstance();
        cal.add(Calendar.HOUR, -1);
        Date oneHourAgo = cal.getTime();

        // 최근 1시간 검색 로그 집계
        List<SearchLog> recentSearches = searchLogRepository.findBySearchedAtAfter(oneHourAgo);
        Map<String, Long> searchCounts = recentSearches.stream()
            .collect(Collectors.groupingBy(SearchLog::getKeyword, Collectors.counting()));

        // 최근 1시간 주문 기록 집계
        List<OrderRecord> recentOrders = orderRecordRepository.findByOrderedAtAfter(oneHourAgo);
        Map<String, Long> orderCounts = recentOrders.stream()
            .collect(Collectors.groupingBy(OrderRecord::getTitle,
                Collectors.summingLong(OrderRecord::getCount)));

        // 모든 키워드 합치기
        Set<String> allKeywords = new HashSet<>();
        allKeywords.addAll(searchCounts.keySet());
        allKeywords.addAll(orderCounts.keySet());

        // 점수 계산: 검색횟수 * 0.4 + 주문량 * 0.6
        List<SearchRanking> rankings = new ArrayList<>();
        for (String keyword : allKeywords) {
            long searchCount = searchCounts.getOrDefault(keyword, 0L);
            long orderCount = orderCounts.getOrDefault(keyword, 0L);
            double score = searchCount * 0.4 + orderCount * 0.6;

            SearchRanking ranking = new SearchRanking();
            ranking.setKeyword(keyword);
            ranking.setSearchCount(searchCount);
            ranking.setOrderCount(orderCount);
            ranking.setScore(score);
            ranking.setChangeDirection("NEW");
            rankings.add(ranking);
        }

        // 점수 기준 정렬, 동점 시 검색 횟수 → 키워드 사전순으로 안정 정렬
        rankings.sort((a, b) -> {
            int cmp = Double.compare(b.getScore(), a.getScore());
            if (cmp != 0) return cmp;
            cmp = Long.compare(b.getSearchCount(), a.getSearchCount());
            if (cmp != 0) return cmp;
            return a.getKeyword().compareTo(b.getKeyword());
        });
        List<SearchRanking> top10 = rankings.stream().limit(10).collect(Collectors.toList());

        // 순위 부여
        for (int i = 0; i < top10.size(); i++) {
            top10.get(i).setRank(i + 1);
        }

        // Cache rankings in Redis
        rankingCacheService.cacheRankings(top10);

        return top10;
    }
}
