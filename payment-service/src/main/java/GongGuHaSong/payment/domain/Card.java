package GongGuHaSong.payment.domain;

import lombok.Data;

import javax.persistence.*;

@Data
@Entity
@Table(name = "cards")
public class Card {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String userId;
    private String cardNumber;
    private String cardCompany;
    private String cardType;
    private String holderName;
    private String expiryDate;
    private int creditLimit;
    private int usedAmount;

    @Column(name = "is_default")
    private boolean isDefault;

    private String status;
}
