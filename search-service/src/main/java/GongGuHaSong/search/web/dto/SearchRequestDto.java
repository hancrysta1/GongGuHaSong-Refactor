package GongGuHaSong.search.web.dto;

import lombok.Data;

@Data
public class SearchRequestDto {
    private String keyword;
    private String userId;
    private String category;
}
