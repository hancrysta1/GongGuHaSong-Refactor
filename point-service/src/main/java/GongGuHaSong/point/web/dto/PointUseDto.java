package GongGuHaSong.point.web.dto;

import lombok.Data;

@Data
public class PointUseDto {
    private String userId;
    private int amount;
    private String description;
}
