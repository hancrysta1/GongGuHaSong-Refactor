package GongGuHaSong.search.service;

import GongGuHaSong.search.domain.SearchRanking;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class RankingCacheService {

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final String RANKINGS_KEY = "search:rankings";
    private static final long RANKINGS_TTL_SECONDS = 60;

    public void cacheRankings(List<SearchRanking> rankings) {
        try {
            String json = objectMapper.writeValueAsString(rankings);
            redisTemplate.opsForValue().set(RANKINGS_KEY, json, RANKINGS_TTL_SECONDS, TimeUnit.SECONDS);
            log.info("Rankings cached: {} entries", rankings.size());
        } catch (JsonProcessingException e) {
            log.error("Failed to cache rankings: {}", e.getMessage());
        }
    }

    public List<SearchRanking> getCachedRankings() {
        String json = redisTemplate.opsForValue().get(RANKINGS_KEY);
        if (json != null) {
            try {
                return objectMapper.readValue(json, new TypeReference<List<SearchRanking>>() {});
            } catch (JsonProcessingException e) {
                log.error("Failed to deserialize cached rankings: {}", e.getMessage());
            }
        }
        return null;
    }
}
