package GongGuHaSong.payment.web.dto;

import lombok.Data;

@Data
public class CardPaymentDto {
    private String cardId;
    private int amount;
    private String description;
}
