package GongGuHaSong.payment.web.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class CardResponseDto {
    private String id;
    private String userId;
    private String maskedCardNumber;    // ****-****-****-1234
    private String cardCompany;
    private String cardType;
    private String holderName;
    private String expiryDate;
    private int creditLimit;
    private int usedAmount;
    private int availableAmount;
    private boolean isDefault;
    private String status;
}
