package GongGuHaSong.payment.web;

import GongGuHaSong.payment.domain.Payment;
import GongGuHaSong.payment.domain.StockReservation;
import GongGuHaSong.payment.service.PaymentService;
import GongGuHaSong.payment.web.dto.PaymentCreateDto;
import GongGuHaSong.payment.web.dto.StockReserveDto;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RequiredArgsConstructor
@RestController
@RequestMapping("/payment")
public class PaymentController {

    private final PaymentService paymentService;

    @PostMapping
    public Payment createPayment(@RequestBody PaymentCreateDto dto) {
        return paymentService.createPayment(
            dto.getOrderId(),
            dto.getUserId(),
            dto.getTitle(),
            dto.getQuantity(),
            dto.getUnitPrice(),
            dto.getPointUsed(),
            dto.getPaymentMethod(),
            dto.getCardId(),
            dto.getProductId()
        );
    }

    @PostMapping("/refund/{paymentId}")
    public Payment refundPayment(@PathVariable Long paymentId) {
        return paymentService.refundPayment(paymentId);
    }

    @GetMapping("/user/{userId}")
    public List<Payment> getPaymentsByUser(@PathVariable String userId) {
        return paymentService.getPaymentsByUser(userId);
    }

    @GetMapping("/product/{title}")
    public List<Payment> getPaymentsByTitle(@PathVariable String title) {
        return paymentService.getPaymentsByTitle(title);
    }

    @PostMapping("/stock/reserve")
    public StockReservation reserveStock(@RequestBody StockReserveDto dto) {
        return paymentService.reserveStock(
            dto.getProductId(), dto.getTitle(), dto.getUserId(), dto.getQuantity());
    }

    @PostMapping("/stock/confirm/{reservationId}")
    public void confirmReservation(@PathVariable Long reservationId) {
        paymentService.confirmReservation(reservationId);
    }

    @PostMapping("/stock/release/{reservationId}")
    public void releaseReservation(@PathVariable Long reservationId) {
        paymentService.releaseReservation(reservationId);
    }

    @GetMapping("/stock/reserved/{productId}")
    public int getReservedQuantity(@PathVariable String productId) {
        return paymentService.getReservedQuantity(productId);
    }
}
