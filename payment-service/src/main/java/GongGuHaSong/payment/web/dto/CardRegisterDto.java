package GongGuHaSong.payment.web.dto;

import lombok.Data;

@Data
public class CardRegisterDto {
    private String cardNumber;
    private String cardCompany;
    private String holderName;
    private String expiryDate;
    private String userId;
}
