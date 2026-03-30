package GongGuHaSong.point.service;

import GongGuHaSong.point.domain.Point;
import GongGuHaSong.point.domain.PointHistory;
import GongGuHaSong.point.repository.PointHistoryRepository;
import GongGuHaSong.point.repository.PointRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Date;

@Service
@RequiredArgsConstructor
public class RedisLockPointInnerService {

    private final PointRepository pointRepository;
    private final PointHistoryRepository pointHistoryRepository;
    private final PointCacheService pointCacheService;

    @Transactional
    public Point usePoints(String userId, int amount, String description) {
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