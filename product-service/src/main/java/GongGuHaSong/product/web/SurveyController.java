package GongGuHaSong.product.web;

import GongGuHaSong.product.domain.Survey;
import GongGuHaSong.product.repository.SurveyRepository;
import GongGuHaSong.product.web.dto.SurveySaveDto;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RequiredArgsConstructor
@RestController
public class SurveyController {

    private final SurveyRepository surveyRepository;

    @GetMapping("/survey")
    public int count(@RequestParam String title) {
        List<Survey> surveys = surveyRepository.findByTitle(title);
        int total = 0;
        for (Survey s : surveys) {
            total += s.getCount();
        }
        return total;
    }

    @PostMapping("/survey")
    public Survey save(@RequestBody SurveySaveDto dto, @RequestParam String title, @RequestParam String userId) {
        dto.setTitle(title);
        dto.setUserId(userId);
        return surveyRepository.save(dto.toEntity(title));
    }
}
