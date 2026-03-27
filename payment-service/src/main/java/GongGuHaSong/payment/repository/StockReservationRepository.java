package GongGuHaSong.payment.repository;

import GongGuHaSong.payment.domain.StockReservation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Date;
import java.util.List;

public interface StockReservationRepository extends JpaRepository<StockReservation, Long> {
    List<StockReservation> findByProductIdAndStatus(String productId, String status);
    List<StockReservation> findByUserIdAndStatus(String userId, String status);
    List<StockReservation> findByStatusAndExpiresAtBefore(String status, Date now);
}
