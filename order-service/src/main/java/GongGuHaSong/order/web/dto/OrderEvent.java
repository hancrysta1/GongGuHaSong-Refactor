package GongGuHaSong.order.web.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class OrderEvent {
    private String orderId;
    private String title;
    private String userId;
    private int quantity;
    private String status; // CREATED, CONFIRMED, CANCELLED
    private Date timestamp;
}
