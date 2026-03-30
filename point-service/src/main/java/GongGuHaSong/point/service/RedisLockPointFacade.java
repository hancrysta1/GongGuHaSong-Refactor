package GongGuHaSong.point.service;

import GongGuHaSong.point.domain.Point;
import GongGuHaSong.point.domain.PointHistory;
import GongGuHaSong.point.repository.PointHistoryRepository;
import GongGuHaSong.point.repository.PointRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Date;
import java.util.concurrent.TimeUnit;

/**
 * Redis 분산 락 기반 포인트 차감
 *
 * 락 순서: Redis Lock 획득 → @Transactional 시작 → DB 작업 (락 없이) → 커밋 → Redis Lock 해제
 * DB 커넥션을 락 대기 중에 점유하지 않으므로 커넥션 풀 고갈 방지
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RedisLockPointFacade {

    private static final String LOCK_PREFIX = "point:lock:";
    private static final long WAIT_TIME = 5L;
    private static final long LEASE_TIME = 3L;

    private final RedissonClient redissonClient;
    private final RedisLockPointInnerService innerService;

    public Point usePoints(String userId, int amount, String description) {
        RLock lock = redissonClient.getLock(LOCK_PREFIX + userId);
        try {
            boolean acquired = lock.tryLock(WAIT_TIME, LEASE_TIME, TimeUnit.SECONDS);
            if (!acquired) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "락 획득 실패 (userId=" + userId + ")");
            }
            return innerService.usePoints(userId, amount, description);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "락 인터럽트");
        } finally {
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }

    /**
     * 트랜잭션 경계를 분리하기 위한 내부 서비스
     * Facade에서 락을 잡고 이 메서드를 호출 → 커밋 후 락 해제
     */
    @Slf4j
    @Service
    @RequiredArgsConstructor
    static class RedisLockPointInnerService {

        private final PointRepository pointRepository;
        private final PointHistoryRepository pointHistoryRepository;
        private final PointCacheService pointCacheService;

        @Transactional
        public Point usePoints(String userId, int amount, String description) {
            // DB 락 없이 조회 — Redis 락이 동시성 보장
            Point point = pointRepository.findByUserId(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "포인트 정보 없음"));

            if (point.getAvailablePoints() < amount) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "포인트 부족 (보유: " + point.getAvailablePoints() + "P)");
            }

            point.setAvailablePoints(point.getAvailablePoints() - amount);

            PointHistory history = new PointHistory();
            history.setUserId(userId);
            history.setAmount(-amount);
            history.setType("USE");
            history.setDescription(description);
            history.setCreatedAt(new Date());
            pointHistoryRepository.save(history);

            pointCacheService.evictPoint(userId);
            return point;
        }
    }
}