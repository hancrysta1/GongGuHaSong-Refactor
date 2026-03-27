package GongGuHaSong.point.domain;

import lombok.Data;

import javax.persistence.*;

@Data
@Entity
@Table(name = "point")
public class Point {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String userId;

    private int totalPoints;
    private int availablePoints;

    @Version
    private Long version;  // 낙관적 락 (JPA 네이티브 지원)
}
