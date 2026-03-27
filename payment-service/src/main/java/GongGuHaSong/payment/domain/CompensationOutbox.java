package GongGuHaSong.payment.domain;

import lombok.Data;

import javax.persistence.*;
import java.util.Date;

@Data
@Entity
@Table(name = "compensation_outbox")
public class CompensationOutbox {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String orderId;
    private String userId;
    private String type;          // POINT_RESTORE, CARD_REFUND, STOCK_RESTORE
    private int amount;
    private String targetId;      // cardId or productId
    private String status;        // PENDING, COMPLETED, FAILED
    private int retryCount;
    private String errorMessage;

    @Temporal(TemporalType.TIMESTAMP)
    private Date createdAt;

    @Temporal(TemporalType.TIMESTAMP)
    private Date completedAt;
}
