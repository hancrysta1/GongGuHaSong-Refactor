package GongGuHaSong.product.service;

import GongGuHaSong.product.domain.Sell;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProductCacheService {

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // --- Order count caching ---

    public int getOrderCount(String title) {
        String value = redisTemplate.opsForValue().get("product:order-count:" + title);
        if (value != null) {
            return Integer.parseInt(value);
        }
        return 0;
    }

    public void incrementOrderCount(String title, int quantity) {
        redisTemplate.opsForValue().increment("product:order-count:" + title, quantity);
    }

    // --- Product info caching ---

    public void cacheProduct(Sell sell) {
        try {
            String json = objectMapper.writeValueAsString(sell);
            redisTemplate.opsForValue().set("product:info:" + sell.get_id(), json, 600, TimeUnit.SECONDS);
            log.info("Product cached: {}", sell.get_id());
        } catch (JsonProcessingException e) {
            log.error("Failed to cache product: {}", e.getMessage());
        }
    }

    public Sell getCachedProduct(String id) {
        String json = redisTemplate.opsForValue().get("product:info:" + id);
        if (json != null) {
            try {
                return objectMapper.readValue(json, Sell.class);
            } catch (JsonProcessingException e) {
                log.error("Failed to deserialize cached product: {}", e.getMessage());
            }
        }
        return null;
    }

    public void evictProduct(String id) {
        redisTemplate.delete("product:info:" + id);
        log.info("Product cache evicted: {}", id);
    }
}
