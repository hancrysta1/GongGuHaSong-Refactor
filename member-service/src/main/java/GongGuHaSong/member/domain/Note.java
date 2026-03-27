package GongGuHaSong.member.domain;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Data
@Document(collection = "note")
public class Note {
    @Id
    private String id;
    private String sender;
    private String receiver;
    private String comment;
    private String time;
    private String title;
}
