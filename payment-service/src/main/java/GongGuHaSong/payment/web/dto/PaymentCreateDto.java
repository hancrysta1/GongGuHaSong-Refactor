package GongGuHaSong.payment.web.dto;

import lombok.Data;

@Data
public class PaymentCreateDto {
    private String orderId;
    private String userId;
    private String title;
    private int quantity;
    private int unitPrice;
    private int pointUsed;
    private String paymentMethod;
    private String cardId;          // CARD, CARD_AND_POINT 결제 시 사용
    private String productId;       // SAGA 보상 시 재고 복구에 사용
}
