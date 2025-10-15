package GongGuHaSong.web;


import GongGuHaSong.domain.Survey;
import GongGuHaSong.repository.SurveyRepository;
import GongGuHaSong.web.dto.SurveySaveDto;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RequiredArgsConstructor
@RestController
public class SurveyController {

    private final SurveyRepository SurveyRepository;

    @GetMapping("/survey")
    public int Count(@RequestParam String title){
        List surveyList = SurveyRepository.findByTitle(title);
        int total = 0;
        for (int i=0; i<surveyList.size();i++){
            Survey survey = (Survey) surveyList.get(i);
            total = total + survey.getCount();
        }
        return total;
    }


    @PostMapping("/survey")
    public Survey save(@RequestBody SurveySaveDto dto, @RequestParam String title, @RequestParam String userId) {
        //@RequsetBody 어노테이션을 붙인 이유는 json 타입으로 데이터를 받기 위함.
        Survey surveyEntity = SurveyRepository.save(dto.toEntity(title, userId));
        return surveyEntity;
    }
}