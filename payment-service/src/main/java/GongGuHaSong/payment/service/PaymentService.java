package GongGuHaSong.payment.service;

import GongGuHaSong.payment.domain.Payment;
import GongGuHaSong.payment.domain.StockReservation;
import GongGuHaSong.payment.repository.PaymentRepository;
import GongGuHaSong.payment.repository.StockReservationRepository;
import GongGuHaSong.payment.client.PointRestClient;
import GongGuHaSong.payment.client.ProductRestClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentService {

    private final PaymentRepository paymentRepository;
    private final StockReservationRepository stockReservationRepository;
    private final PointRestClient pointRestClient;
    private final ProductRestClient productRestClient;
    private final CardService cardService;
    private final HmacService hmacService;
    private final CompensationService compensationService;

    /**
     * SAGA Orchestration 결제.
     *
     * STEP 1: HMAC 서명 검증 (위변조 방지)
     * STEP 2: 결제 수단 처리 (포인트 차감 또는 카드 결제 또는 복합)
     * STEP 3: 결제 기록 저장 (MySQL @Transactional)
     *
     * 실패 시 역순 보상: 카드 환불 → 포인트 복구 → 재고 복구
     */
    public Payment createPayment(String orderId, String userId, String title,
                                  int quantity, int unitPrice, int pointUsed,
                                  String paymentMethod, String cardId,
                                  String productId) {
        int totalAmount = quantity * unitPrice;
        int cardAmount = 0;
        String approvalNumber = null;
        boolean pointDeducted = false;
        boolean cardCharged = false;

        // ── STEP 1: HMAC 서명 검증 ──
        String signature = hmacService.sign(orderId, totalAmount);
        if (!hmacService.verify(orderId, totalAmount, signature)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "결제 데이터 위변조 감지");
        }
        log.info("[SAGA] STEP1: HMAC 서명 검증 통과 (orderId={}, amount={})", orderId, totalAmount);

        try {
            // ── STEP 2: 결제 수단 처리 ──
            switch (paymentMethod) {
                case "POINT":
                    if (pointUsed > 0) {
                        pointRestClient.usePoints(userId, pointUsed, title + " 포인트 결제");
                        pointDeducted = true;
                        log.info("[SAGA] STEP2: 포인트 {}P 차감", pointUsed);
                    }
                    break;

                case "CARD":
                    cardAmount = totalAmount;
                    Map<String, Object> cardResult = cardService.processCardPayment(cardId, cardAmount);
                    approvalNumber = (String) cardResult.get("approvalNumber");
                    cardCharged = true;
                    log.info("[SAGA] STEP2: 카드 {}원 결제 (승인번호: {})", cardAmount, approvalNumber);
                    break;

                case "CARD_AND_POINT":
                    if (pointUsed > 0) {
                        pointRestClient.usePoints(userId, pointUsed, title + " 복합결제 포인트");
                        pointDeducted = true;
                    }
                    cardAmount = totalAmount - pointUsed;
                    if (cardAmount > 0) {
                        Map<String, Object> mixedResult = cardService.processCardPayment(cardId, cardAmount);
                        approvalNumber = (String) mixedResult.get("approvalNumber");
                        cardCharged = true;
                    }
                    log.info("[SAGA] STEP2: 포인트 {}P + 카드 {}원 복합결제", pointUsed, cardAmount);
                    break;

                default:
                    if (pointUsed > 0) {
                        pointRestClient.usePoints(userId, pointUsed, title + " 결제");
                        pointDeducted = true;
                    }
                    break;
            }

            int finalAmount = totalAmount - pointUsed - cardAmount;

            // [CHAOS] Outbox 테스트용 10% 장애 주입
            if (pointUsed > 0 && Math.random() < 0.1) {
                log.error("[CHAOS] 장애 주입: orderId={}", orderId);
                throw new RuntimeException("[CHAOS] Outbox 테스트 장애 시뮬레이션");
            }

            // ── STEP 3: 결제 기록 저장 ──
            Payment payment = new Payment();
            payment.setOrderId(orderId);
            payment.setUserId(userId);
            payment.setTitle(title);
            payment.setQuantity(quantity);
            payment.setUnitPrice(unitPrice);
            payment.setTotalAmount(totalAmount);
            payment.setPointUsed(pointUsed);
            payment.setCardAmount(cardAmount);
            payment.setFinalAmount(finalAmount);
            payment.setStatus("COMPLETED");
            payment.setPaymentMethod(paymentMethod);
            payment.setCardId(cardId);
            payment.setApprovalNumber(approvalNumber);
            payment.setHmacSignature(signature);
            payment.setCreatedAt(new Date());
            payment.setCompletedAt(new Date());

            Payment saved = paymentRepository.save(payment);
            log.info("[SAGA] STEP3: 결제 기록 저장 완료 (paymentId={})", saved.getId());
            return saved;

        } catch (Exception e) {
            // ── SAGA 보상 트랜잭션: 역순으로 롤백 ──
            log.warn("[SAGA] 결제 실패 → 보상 시작: {}", e.getMessage());

            // 3. 카드 환불
            if (cardCharged && cardId != null) {
                try {
                    cardService.refundCardPayment(cardId, cardAmount);
                    log.info("[SAGA] 보상: 카드 {}원 환불", cardAmount);
                } catch (Exception ex) {
                    log.error("[SAGA] 보상 실패 → Outbox 저장: 카드 환불");
                    compensationService.saveFailedCompensation(orderId, userId,
                        "CARD_REFUND", cardAmount, cardId, ex.getMessage());
                }
            }

            // 2. 포인트 복구
            if (pointDeducted) {
                try {
                    pointRestClient.cancelPoints(userId, pointUsed, title + " 결제 실패 복구");
                    log.info("[SAGA] 보상: 포인트 {}P 복구", pointUsed);
                } catch (Exception ex) {
                    log.error("[SAGA] 보상 실패 → Outbox 저장: 포인트 복구");
                    compensationService.saveFailedCompensation(orderId, userId,
                        "POINT_RESTORE", pointUsed, null, ex.getMessage());
                }
            }

            // 1. 재고 복구
            if (productId != null) {
                try {
                    productRestClient.restoreStock(productId, quantity);
                    log.info("[SAGA] 보상: 재고 {}개 복구", quantity);
                } catch (Exception ex) {
                    log.error("[SAGA] 보상 실패 → Outbox 저장: 재고 복구");
                    compensationService.saveFailedCompensation(orderId, userId,
                        "STOCK_RESTORE", quantity, productId, ex.getMessage());
                }
            }

            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                "결제 처리 중 오류가 발생했습니다. 차감된 금액과 재고는 자동 복구됩니다.");
        }
    }

    public Payment refundPayment(Long paymentId) {
        Payment payment = paymentRepository.findById(paymentId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "결제 정보를 찾을 수 없습니다."));

        if (!"COMPLETED".equals(payment.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "환불 가능한 상태가 아닙니다.");
        }

        if (payment.getPointUsed() > 0) {
            try {
                pointRestClient.cancelPoints(
                    payment.getUserId(), payment.getPointUsed(), payment.getTitle() + " 환불 포인트 복구");
            } catch (Exception e) {
                log.warn("포인트 복구 실패: {}", e.getMessage());
            }
        }

        // 카드 결제 환불
        if (payment.getCardAmount() > 0 && payment.getCardId() != null) {
            try {
                cardService.refundCardPayment(payment.getCardId(), payment.getCardAmount());
            } catch (Exception e) {
                log.warn("카드 환불 실패: {}", e.getMessage());
            }
        }

        payment.setStatus("REFUNDED");
        return paymentRepository.save(payment);
    }

    public StockReservation reserveStock(String productId, String title, String userId, int quantity) {
        StockReservation reservation = new StockReservation();
        reservation.setProductId(productId);
        reservation.setTitle(title);
        reservation.setUserId(userId);
        reservation.setQuantity(quantity);
        reservation.setStatus("RESERVED");
        reservation.setCreatedAt(new Date());

        Calendar cal = Calendar.getInstance();
        cal.add(Calendar.MINUTE, 30);
        reservation.setExpiresAt(cal.getTime());

        return stockReservationRepository.save(reservation);
    }

    public void confirmReservation(Long reservationId) {
        StockReservation reservation = stockReservationRepository.findById(reservationId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "예약을 찾을 수 없습니다."));
        reservation.setStatus("CONFIRMED");
        stockReservationRepository.save(reservation);
    }

    public void releaseReservation(Long reservationId) {
        StockReservation reservation = stockReservationRepository.findById(reservationId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "예약을 찾을 수 없습니다."));
        reservation.setStatus("RELEASED");
        stockReservationRepository.save(reservation);
    }

    @Scheduled(fixedRate = 60000)
    public void releaseExpiredReservations() {
        List<StockReservation> expired = stockReservationRepository
            .findByStatusAndExpiresAtBefore("RESERVED", new Date());
        for (StockReservation reservation : expired) {
            reservation.setStatus("RELEASED");
            stockReservationRepository.save(reservation);
            log.info("만료된 재고 예약 해제: {}", reservation.getId());
        }
    }

    public List<Payment> getPaymentsByUser(String userId) {
        return paymentRepository.findByUserId(userId);
    }

    public List<Payment> getPaymentsByTitle(String title) {
        return paymentRepository.findByTitle(title);
    }

    public int getReservedQuantity(String productId) {
        List<StockReservation> reservations = stockReservationRepository
            .findByProductIdAndStatus(productId, "RESERVED");
        return reservations.stream().mapToInt(StockReservation::getQuantity).sum();
    }
}
