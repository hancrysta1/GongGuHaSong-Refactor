package GongGuHaSong.payment.repository;

import GongGuHaSong.payment.domain.CompensationOutbox;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CompensationOutboxRepository extends JpaRepository<CompensationOutbox, Long> {
    List<CompensationOutbox> findByStatusAndRetryCountLessThan(String status, int maxRetry);
}
