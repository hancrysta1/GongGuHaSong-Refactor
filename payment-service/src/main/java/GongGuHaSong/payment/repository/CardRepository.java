package GongGuHaSong.payment.repository;

import GongGuHaSong.payment.domain.Card;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CardRepository extends JpaRepository<Card, Long> {
    List<Card> findByUserId(String userId);
    Optional<Card> findByUserIdAndIsDefaultTrue(String userId);
    Optional<Card> findByCardNumber(String cardNumber);
}
