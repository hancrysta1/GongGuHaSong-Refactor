package GongGuHaSong.payment.service;

import GongGuHaSong.payment.domain.Card;
import GongGuHaSong.payment.repository.CardRepository;
import GongGuHaSong.payment.web.dto.CardResponseDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class CardService {

    private final CardRepository cardRepository;

    /**
     * 카드 등록 — Mock 카드사 API로 검증 후 DB 저장
     */
    public CardResponseDto registerCard(String userId, String cardNumber, String cardCompany,
                                         String holderName, String expiryDate) {
        // 중복 카드 체크
        cardRepository.findByCardNumber(cardNumber).ifPresent(existing -> {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 등록된 카드번호입니다.");
        });

        // Mock 카드사 API 검증
        Map<String, Object> mockResponse = getMockCardInfo(cardNumber);

        String resultCode = (String) mockResponse.get("resultCode");
        if (!"0000".equals(resultCode)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "카드 검증 실패: " + mockResponse.get("resultMessage"));
        }

        // 카드사 API 응답으로부터 카드 정보 설정
        Card card = new Card();
        card.setUserId(userId);
        card.setCardNumber(cardNumber);
        card.setCardCompany(cardCompany);
        card.setCardType((String) mockResponse.get("cardType"));
        card.setHolderName(holderName);
        card.setExpiryDate(expiryDate);
        card.setCreditLimit((int) mockResponse.get("creditLimit"));
        card.setUsedAmount(0);
        card.setStatus((String) mockResponse.get("cardStatus"));

        // 사용자의 첫 카드이면 기본 결제 수단으로 설정
        List<Card> existingCards = cardRepository.findByUserId(userId);
        card.setDefault(existingCards.isEmpty());

        Card saved = cardRepository.save(card);
        log.info("카드 등록 완료: userId={}, cardCompany={}, maskedNumber={}",
            userId, cardCompany, maskCardNumber(cardNumber));

        return toResponseDto(saved);
    }

    /**
     * 사용자의 카드 목록 조회 (카드번호 마스킹)
     */
    public List<CardResponseDto> getUserCards(String userId) {
        return cardRepository.findByUserId(userId).stream()
            .map(this::toResponseDto)
            .collect(Collectors.toList());
    }

    /**
     * 카드 상세 조회 (카드번호 마스킹)
     */
    public CardResponseDto getCardDetail(String cardId) {
        Card card = cardRepository.findById(Long.parseLong(cardId))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "카드를 찾을 수 없습니다."));
        return toResponseDto(card);
    }

    /**
     * 카드 삭제
     */
    public void deleteCard(String cardId) {
        Card card = cardRepository.findById(Long.parseLong(cardId))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "카드를 찾을 수 없습니다."));

        cardRepository.delete(card);
        log.info("카드 삭제 완료: cardId={}, userId={}", cardId, card.getUserId());

        // 기본 카드 삭제 시 다른 카드를 기본으로 설정
        if (card.isDefault()) {
            List<Card> remainingCards = cardRepository.findByUserId(card.getUserId());
            if (!remainingCards.isEmpty()) {
                Card newDefault = remainingCards.get(0);
                newDefault.setDefault(true);
                cardRepository.save(newDefault);
                log.info("기본 카드 변경: cardId={}", newDefault.getId());
            }
        }
    }

    /**
     * 카드 결제 처리 (Mock) — 한도 확인 후 사용 금액 차감
     */
    public Map<String, Object> processCardPayment(String cardId, int amount) {
        Card card = cardRepository.findById(Long.parseLong(cardId))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "카드를 찾을 수 없습니다."));

        if (!"ACTIVE".equals(card.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "비활성화된 카드입니다.");
        }

        int availableAmount = card.getCreditLimit() - card.getUsedAmount();
        if (amount > availableAmount) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "카드 한도 초과입니다. 사용 가능 금액: " + availableAmount + "원");
        }

        // 사용 금액 차감
        card.setUsedAmount(card.getUsedAmount() + amount);
        cardRepository.save(card);

        log.info("카드 결제 완료: cardId={}, amount={}, remainingLimit={}",
            cardId, amount, card.getCreditLimit() - card.getUsedAmount());

        // Mock 결제 승인 응답
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("resultCode", "0000");
        response.put("resultMessage", "결제 승인 완료");
        response.put("approvalNumber", generateApprovalNumber());
        response.put("cardCompany", card.getCardCompany());
        response.put("maskedCardNumber", maskCardNumber(card.getCardNumber()));
        response.put("amount", amount);
        response.put("availableAmount", card.getCreditLimit() - card.getUsedAmount());
        response.put("transactionDate", new Date());

        return response;
    }

    /**
     * 카드 결제 환불 — 사용 금액 복구
     */
    public void refundCardPayment(String cardId, int amount) {
        Card card = cardRepository.findById(Long.parseLong(cardId))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "카드를 찾을 수 없습니다."));

        card.setUsedAmount(Math.max(0, card.getUsedAmount() - amount));
        cardRepository.save(card);

        log.info("카드 결제 환불 완료: cardId={}, refundAmount={}", cardId, amount);
    }

    /**
     * Mock 카드사 API — 카드번호로 카드사 검증 응답 시뮬레이션
     * 실제 카드사 API(신한, 삼성, 현대 등)의 응답 형식을 모방
     */
    public Map<String, Object> getMockCardInfo(String cardNumber) {
        Map<String, Object> response = new LinkedHashMap<>();

        // 카드번호 유효성 검사 (16자리 숫자)
        String digits = cardNumber.replaceAll("-", "");
        if (digits.length() != 16 || !digits.matches("\\d+")) {
            response.put("resultCode", "1001");
            response.put("resultMessage", "유효하지 않은 카드번호입니다.");
            return response;
        }

        // 카드번호 앞자리로 카드사 및 타입 결정 (Mock 로직)
        String prefix = digits.substring(0, 4);
        String mockCompany;
        String mockType;
        int mockLimit;

        switch (prefix.substring(0, 2)) {
            case "41":  // 신한카드 (VISA 계열)
                mockCompany = "신한카드";
                mockType = "CREDIT";
                mockLimit = 5000000;
                break;
            case "52":  // 삼성카드 (Mastercard 계열)
                mockCompany = "삼성카드";
                mockType = "CREDIT";
                mockLimit = 7000000;
                break;
            case "35":  // 현대카드 (JCB 계열)
                mockCompany = "현대카드";
                mockType = "CREDIT";
                mockLimit = 10000000;
                break;
            case "62":  // KB국민카드 (UnionPay 계열)
                mockCompany = "KB국민카드";
                mockType = "CREDIT";
                mockLimit = 3000000;
                break;
            case "94":  // 체크카드 (DEBIT)
                mockCompany = "신한카드";
                mockType = "DEBIT";
                mockLimit = 1000000;
                break;
            default:
                mockCompany = "기타카드";
                mockType = "CREDIT";
                mockLimit = 2000000;
                break;
        }

        response.put("resultCode", "0000");
        response.put("resultMessage", "정상처리");
        response.put("cardCompany", mockCompany);
        response.put("cardType", mockType);
        response.put("holderName", "홍길동");
        response.put("creditLimit", mockLimit);
        response.put("availableAmount", mockLimit);
        response.put("cardStatus", "ACTIVE");

        return response;
    }

    /**
     * 카드번호 마스킹 — 마지막 4자리만 노출
     * 예: "1234-5678-9012-3456" -> "****-****-****-3456"
     */
    private String maskCardNumber(String cardNumber) {
        String digits = cardNumber.replaceAll("-", "");
        if (digits.length() < 4) {
            return "****";
        }
        String lastFour = digits.substring(digits.length() - 4);
        return "****-****-****-" + lastFour;
    }

    /**
     * Mock 승인번호 생성
     */
    private String generateApprovalNumber() {
        return "AP" + System.currentTimeMillis() % 100000000;
    }

    /**
     * Card -> CardResponseDto 변환
     */
    private CardResponseDto toResponseDto(Card card) {
        return CardResponseDto.builder()
            .id(String.valueOf(card.getId()))
            .userId(card.getUserId())
            .maskedCardNumber(maskCardNumber(card.getCardNumber()))
            .cardCompany(card.getCardCompany())
            .cardType(card.getCardType())
            .holderName(card.getHolderName())
            .expiryDate(card.getExpiryDate())
            .creditLimit(card.getCreditLimit())
            .usedAmount(card.getUsedAmount())
            .availableAmount(card.getCreditLimit() - card.getUsedAmount())
            .isDefault(card.isDefault())
            .status(card.getStatus())
            .build();
    }
}
