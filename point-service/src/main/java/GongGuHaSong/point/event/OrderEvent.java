package GongGuHaSong.point.event;

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
    private String status;
    private Date timestamp;
}
