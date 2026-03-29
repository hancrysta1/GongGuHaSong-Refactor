package GongGuHaSong.payment.web;

import GongGuHaSong.payment.domain.Payment;
import GongGuHaSong.payment.service.PaymentService;
import GongGuHaSong.payment.web.dto.PaymentCreateDto;
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

}
