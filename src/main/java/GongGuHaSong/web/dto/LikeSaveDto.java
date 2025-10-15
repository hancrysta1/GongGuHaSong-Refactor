package GongGuHaSong.web.dto;


import GongGuHaSong.domain.Like;
import lombok.Data;

import java.util.Date;

@Data
public class LikeSaveDto {
    private String pid;
    private String name;
    private Date startDate = new Date();
    private Date endDate = new Date();

    private Integer end;

    public Like toEntity(){

        Like like = new Like();
        like.setPid(pid);
        like.setName(name);
        like.setStartDate(startDate);
        like.setEndDate(endDate);
        like.setEnd(end);

        return like;
    }
}
