package GongGuHaSong.payment.repository;

import GongGuHaSong.payment.domain.Payment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PaymentRepository extends JpaRepository<Payment, Long> {
    List<Payment> findByUserId(String userId);
    List<Payment> findByOrderId(String orderId);
    List<Payment> findByTitle(String title);
    Optional<Payment> findByOrderIdAndStatus(String orderId, String status);
}
