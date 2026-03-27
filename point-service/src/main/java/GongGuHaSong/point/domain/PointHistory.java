package GongGuHaSong.point.domain;

import lombok.Data;

import javax.persistence.*;
import java.util.Date;

@Data
@Entity
@Table(name = "point_history")
public class PointHistory {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String userId;

    private int amount;
    private String type; // EARN, USE, CANCEL
    private String description;

    @Temporal(TemporalType.TIMESTAMP)
    private Date createdAt;
}
