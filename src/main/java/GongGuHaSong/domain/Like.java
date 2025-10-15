package GongGuHaSong.domain;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.Date;

@Data
@Document(collection = "like")
public class Like {
    @Id
    private String id;
    private String pid;
    private String name;
    private Date startDate;
    private Date endDate;
    private Integer end; //공구 종료 여부
}