package GongGuHaSong.product.web.dto;

import GongGuHaSong.product.domain.Survey;
import lombok.Data;

@Data
public class SurveySaveDto {
    private String title;
    private String userId;
    private int count;

    public Survey toEntity(String title) {
        Survey survey = new Survey();
        survey.setTitle(title);
        survey.setUserId(userId);
        survey.setCount(count);
        return survey;
    }
}
