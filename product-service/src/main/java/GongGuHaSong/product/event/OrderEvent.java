package GongGuHaSong.product.event;

import lombok.Data;
import java.util.Date;

@Data
public class OrderEvent {
    private String orderId;
    private String title;
    private String userId;
    private int quantity;
    private String status;
    private Date timestamp;
}
