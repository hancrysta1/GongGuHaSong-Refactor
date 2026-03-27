package GongGuHaSong.payment.web;

import GongGuHaSong.payment.service.CardService;
import GongGuHaSong.payment.web.dto.CardPaymentDto;
import GongGuHaSong.payment.web.dto.CardRegisterDto;
import GongGuHaSong.payment.web.dto.CardResponseDto;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RequiredArgsConstructor
@RestController
@RequestMapping("/payment/card")
public class CardController {

    private final CardService cardService;

    /**
     * 카드 등록
     */
    @PostMapping
    public CardResponseDto registerCard(@RequestBody CardRegisterDto dto) {
        return cardService.registerCard(
            dto.getUserId(),
            dto.getCardNumber(),
            dto.getCardCompany(),
            dto.getHolderName(),
            dto.getExpiryDate()
        );
    }

    /**
     * 사용자 카드 목록 조회 (마스킹)
     */
    @GetMapping("/{userId}")
    public List<CardResponseDto> getUserCards(@PathVariable String userId) {
        return cardService.getUserCards(userId);
    }

    /**
     * 카드 상세 조회 (마스킹)
     */
    @GetMapping("/detail/{cardId}")
    public CardResponseDto getCardDetail(@PathVariable String cardId) {
        return cardService.getCardDetail(cardId);
    }

    /**
     * 카드 삭제
     */
    @DeleteMapping("/{cardId}")
    public void deleteCard(@PathVariable String cardId) {
        cardService.deleteCard(cardId);
    }

    /**
     * 카드 결제
     */
    @PostMapping("/pay")
    public Map<String, Object> processCardPayment(@RequestBody CardPaymentDto dto) {
        return cardService.processCardPayment(dto.getCardId(), dto.getAmount());
    }

    /**
     * 카드 검증 (Mock 카드사 API)
     */
    @GetMapping("/verify/{cardNumber}")
    public Map<String, Object> verifyCard(@PathVariable String cardNumber) {
        return cardService.getMockCardInfo(cardNumber);
    }
}
