package GongGuHaSong.search.event;

import lombok.Data;
import java.util.Date;

@Data
public class ProductEvent {
    private String productId;
    private String title;
    private String info;
    private String category;
    private String managerId;
    private int price;
    private int stock;
    private Date startDate;
    private Date finishDate;
    private String mainPhoto;
    private String status; // CREATED, UPDATED, DELETED
}
