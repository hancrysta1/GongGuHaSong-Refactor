package GongGuHaSong.point.service;

import GongGuHaSong.point.domain.Point;
import GongGuHaSong.point.domain.PointHistory;
import GongGuHaSong.point.repository.PointHistoryRepository;
import GongGuHaSong.point.repository.PointRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Date;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class PointService {

    private final PointRepository pointRepository;
    private final PointHistoryRepository pointHistoryRepository;
    private final PointCacheService pointCacheService;

    @Transactional(readOnly = true)
    public Point getPoint(String userId) {
        Integer cachedBalance = pointCacheService.getCachedPoint(userId);
        if (cachedBalance != null) {
            Point cachedPoint = pointRepository.findByUserId(userId).orElse(null);
            if (cachedPoint != null) return cachedPoint;
        }

        Point point = pointRepository.findByUserId(userId)
            .orElseGet(() -> {
                Point newPoint = new Point();
                newPoint.setUserId(userId);
                newPoint.setTotalPoints(0);
                newPoint.setAvailablePoints(0);
                return pointRepository.save(newPoint);
            });

        pointCacheService.cachePoint(userId, point.getAvailablePoints());
        return point;
    }

    @Transactional
    public Point earnPoints(String userId, int amount, String description) {
        Point point = pointRepository.findByUserIdForUpdate(userId)
            .orElseGet(() -> {
                Point newPoint = new Point();
                newPoint.setUserId(userId);
                newPoint.setTotalPoints(0);
                newPoint.setAvailablePoints(0);
                return pointRepository.save(newPoint);
            });

        point.setTotalPoints(point.getTotalPoints() + amount);
        point.setAvailablePoints(point.getAvailablePoints() + amount);
        // JPA dirty checking으로 자동 UPDATE

        PointHistory history = new PointHistory();
        history.setUserId(userId);
        history.setAmount(amount);
        history.setType("EARN");
        history.setDescription(description);
        history.setCreatedAt(new Date());
        pointHistoryRepository.save(history);

        pointCacheService.evictPoint(userId);
        return point;
    }

    /**
     * 포인트 차감 — SELECT FOR UPDATE (비관적 락)
     *
     * MySQL에서 하나의 트랜잭션 안에서:
     * 1. SELECT ... FOR UPDATE → 해당 행에 배타 락 획득 (다른 트랜잭션 대기)
     * 2. 잔액 검증
     * 3. UPDATE (차감)
     * 4. INSERT (이력)
     * 5. COMMIT → 전부 성공 or 전부 롤백
     *
     * MongoDB findAndModify와 달리, 차감 + 이력이 하나의 트랜잭션으로 묶임
     */
    @Transactional
    public Point usePoints(String userId, int amount, String description) {
        // SELECT ... FOR UPDATE: 행 잠금
        Point point = pointRepository.findByUserIdForUpdate(userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "포인트 정보 없음"));

        if (point.getAvailablePoints() < amount) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "포인트가 부족합니다. (보유: " + point.getAvailablePoints() + "P, 사용: " + amount + "P)");
        }

        point.setAvailablePoints(point.getAvailablePoints() - amount);
        // JPA dirty checking → UPDATE 자동 실행

        PointHistory history = new PointHistory();
        history.setUserId(userId);
        history.setAmount(-amount);
        history.setType("USE");
        history.setDescription(description);
        history.setCreatedAt(new Date());
        pointHistoryRepository.save(history);
        // ↑ 이 INSERT도 같은 트랜잭션 — 실패 시 위 UPDATE도 롤백됨

        pointCacheService.evictPoint(userId);
        return point;
    }

    /**
     * 포인트 복구 — SAGA 보상 트랜잭션
     */
    @Transactional
    public Point cancelPoints(String userId, int amount, String description) {
        Point point = pointRepository.findByUserIdForUpdate(userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "포인트 정보 없음"));

        point.setTotalPoints(point.getTotalPoints() + amount);
        point.setAvailablePoints(point.getAvailablePoints() + amount);

        PointHistory history = new PointHistory();
        history.setUserId(userId);
        history.setAmount(amount);
        history.setType("CANCEL");
        history.setDescription(description);
        history.setCreatedAt(new Date());
        pointHistoryRepository.save(history);

        pointCacheService.evictPoint(userId);
        return point;
    }

    @Transactional(readOnly = true)
    public List<PointHistory> getHistory(String userId) {
        return pointHistoryRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }
}
