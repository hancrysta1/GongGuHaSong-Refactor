package GongGuHaSong.search.domain;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.Date;

@Data
@Document(collection = "search_log")
public class SearchLog {
    @Id
    private String id;
    private String keyword;
    private String userId;
    private Date searchedAt;
}
