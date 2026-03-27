package GongGuHaSong.product.web.dto;

import GongGuHaSong.product.domain.Like;
import lombok.Data;

@Data
public class LikeSaveDto {
    private String pid;
    private String name;
    private String startDate;
    private String endDate;
    private boolean end;

    public Like toEntity() {
        Like like = new Like();
        like.setPid(pid);
        like.setName(name);
        like.setStartDate(startDate);
        like.setEndDate(endDate);
        like.setEnd(end);
        return like;
    }
}
