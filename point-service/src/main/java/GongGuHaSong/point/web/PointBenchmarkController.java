package GongGuHaSong.point.web;

import GongGuHaSong.point.domain.Point;
import GongGuHaSong.point.service.RedisLockPointFacade;
import GongGuHaSong.point.web.dto.PointUseDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RequiredArgsConstructor
@RestController
@RequestMapping("/point-benchmark")
public class PointBenchmarkController {

    private final RedisLockPointFacade redisLockPointFacade;

    @PostMapping("/use-redis")
    public Point usePointsWithRedisLock(@RequestBody PointUseDto dto) {
        return redisLockPointFacade.usePoints(dto.getUserId(), dto.getAmount(), dto.getDescription());
    }
}