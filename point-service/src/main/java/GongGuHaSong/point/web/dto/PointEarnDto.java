package GongGuHaSong.point.web.dto;

import lombok.Data;

@Data
public class PointEarnDto {
    private String userId;
    private int amount;
    private String type;
    private String description;
}
