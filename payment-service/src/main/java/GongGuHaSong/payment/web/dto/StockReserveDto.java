package GongGuHaSong.payment.web.dto;

import lombok.Data;

@Data
public class StockReserveDto {
    private String productId;
    private String title;
    private String userId;
    private int quantity;
}
