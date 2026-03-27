package GongGuHaSong.point.web;

import GongGuHaSong.point.domain.Point;
import GongGuHaSong.point.domain.PointHistory;
import GongGuHaSong.point.service.PointService;
import GongGuHaSong.point.web.dto.PointEarnDto;
import GongGuHaSong.point.web.dto.PointUseDto;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RequiredArgsConstructor
@RestController
@RequestMapping("/point")
public class PointController {

    private final PointService pointService;

    @GetMapping("/{userId}")
    public Point getPoint(@PathVariable String userId) {
        return pointService.getPoint(userId);
    }

    @GetMapping("/{userId}/history")
    public List<PointHistory> getHistory(@PathVariable String userId) {
        return pointService.getHistory(userId);
    }

    @PostMapping("/earn")
    public Point earnPoints(@RequestBody PointEarnDto dto) {
        return pointService.earnPoints(dto.getUserId(), dto.getAmount(), dto.getDescription());
    }

    @PostMapping("/use")
    public Point usePoints(@RequestBody PointUseDto dto) {
        return pointService.usePoints(dto.getUserId(), dto.getAmount(), dto.getDescription());
    }

    @PostMapping("/cancel")
    public Point cancelPoints(@RequestBody PointUseDto dto) {
        return pointService.cancelPoints(dto.getUserId(), dto.getAmount(), dto.getDescription());
    }
}
