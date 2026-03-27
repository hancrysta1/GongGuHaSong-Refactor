package GongGuHaSong.payment.domain;

import lombok.Data;

import javax.persistence.*;
import java.util.Date;

@Data
@Entity
@Table(name = "payment")
public class Payment {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String orderId;
    private String userId;
    private String title;
    private int quantity;
    private int unitPrice;
    private int totalAmount;
    private int pointUsed;
    private int cardAmount;
    private int finalAmount;
    private String status;
    private String paymentMethod;
    private String cardId;
    private String approvalNumber;
    private String hmacSignature;  // HMAC-SHA256 서명 (위변조 검증용)

    @Temporal(TemporalType.TIMESTAMP)
    private Date createdAt;

    @Temporal(TemporalType.TIMESTAMP)
    private Date completedAt;
}
