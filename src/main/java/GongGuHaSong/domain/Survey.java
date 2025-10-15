package GongGuHaSong.domain;


import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Data
@Document(collection = "survey")
public class Survey {
    @Id
    private String _id;
    private String title;
    private String userId;
    private int count;
}
