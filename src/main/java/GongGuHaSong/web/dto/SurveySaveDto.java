package GongGuHaSong.web.dto;


import GongGuHaSong.domain.Survey;
import lombok.Data;

@Data
public class SurveySaveDto{
    private int count;

    public Survey toEntity(String title, String userId){
        Survey survey = new Survey();
        survey.setTitle(title);
        survey.setUserId(userId);
        survey.setCount(count);
        return survey;
    }
}
