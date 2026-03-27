package GongGuHaSong.point.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class PointCacheService {

    private final StringRedisTemplate redisTemplate;

    private static final long POINT_TTL_SECONDS = 300;

    public void cachePoint(String userId, int availablePoints) {
        redisTemplate.opsForValue().set("point:balance:" + userId, String.valueOf(availablePoints), POINT_TTL_SECONDS, TimeUnit.SECONDS);
        log.info("Point balance cached for user: {}", userId);
    }

    public Integer getCachedPoint(String userId) {
        String value = redisTemplate.opsForValue().get("point:balance:" + userId);
        if (value != null) {
            return Integer.parseInt(value);
        }
        return null;
    }

    public void evictPoint(String userId) {
        redisTemplate.delete("point:balance:" + userId);
        log.info("Point cache evicted for user: {}", userId);
    }
}
