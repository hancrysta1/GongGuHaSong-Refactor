package GongGuHaSong.domain;


import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.Date;

@Data
@Document(collection = "sell")
public class Sell {
    @Id
    private String _id;
    private String title;
    private String managerId;
    private int price;
    private int min_count;
    private String info;
    private Date startDate;
    private Date finishDate;
    private Date startResearch;
    private Date finishResearch;
    private String notice;
    private String category;
    private String mainPhoto;
    private String sizePhoto;
    private String accountName;
    private String account;
}
