package GongGuHaSong.search.domain;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.Date;

@Data
@Document(collection = "order_record")
public class OrderRecord {
    @Id
    private String id;
    private String title;
    private int count;
    private Date orderedAt;
}
