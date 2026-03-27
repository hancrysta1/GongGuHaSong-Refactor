package GongGuHaSong.payment.service;

import GongGuHaSong.payment.domain.CompensationOutbox;
import GongGuHaSong.payment.repository.CompensationOutboxRepository;
import GongGuHaSong.payment.client.PointRestClient;
import GongGuHaSong.payment.client.ProductRestClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class CompensationService {

    private final CompensationOutboxRepository outboxRepository;
    private final PointRestClient pointRestClient;
    private final ProductRestClient productRestClient;
    private final CardService cardService;

    private static final int MAX_RETRY = 5;

    /**
     * 보상 실패 건을 outbox에 저장한다.
     * SAGA catch 블록에서 보상 호출이 실패했을 때 호출된다.
     */
    public void saveFailedCompensation(String orderId, String userId, String type,
                                        int amount, String targetId, String errorMessage) {
        CompensationOutbox outbox = new CompensationOutbox();
        outbox.setOrderId(orderId);
        outbox.setUserId(userId);
        outbox.setType(type);
        outbox.setAmount(amount);
        outbox.setTargetId(targetId);
        outbox.setStatus("PENDING");
        outbox.setRetryCount(0);
        outbox.setErrorMessage(errorMessage);
        outbox.setCreatedAt(new Date());
        outboxRepository.save(outbox);
        log.info("[OUTBOX] 보상 실패 건 저장: type={}, userId={}, amount={}", type, userId, amount);
    }

    /**
     * 30초마다 PENDING 상태의 보상 건을 재시도한다.
     * 최대 5회까지 재시도하고, 5회 초과 시 FAILED로 전환한다.
     */
    @Scheduled(fixedRate = 30000)
    public void retryFailedCompensations() {
        List<CompensationOutbox> pendings = outboxRepository
            .findByStatusAndRetryCountLessThan("PENDING", MAX_RETRY);

        for (CompensationOutbox outbox : pendings) {
            try {
                switch (outbox.getType()) {
                    case "POINT_RESTORE":
                        pointRestClient.cancelPoints(
                            outbox.getUserId(), outbox.getAmount(),
                            "OUTBOX 재시도 포인트 복구 (orderId=" + outbox.getOrderId() + ")");
                        break;
                    case "CARD_REFUND":
                        cardService.refundCardPayment(outbox.getTargetId(), outbox.getAmount());
                        break;
                    case "STOCK_RESTORE":
                        productRestClient.restoreStock(outbox.getTargetId(), outbox.getAmount());
                        break;
                    case "POINT_EARN_REVOKE":
                        pointRestClient.usePoints(
                            outbox.getUserId(), outbox.getAmount(),
                            "OUTBOX 재시도 적립 회수 (orderId=" + outbox.getOrderId() + ")");
                        break;
                }

                outbox.setStatus("COMPLETED");
                outbox.setCompletedAt(new Date());
                outboxRepository.save(outbox);
                log.info("[OUTBOX] 보상 재시도 성공: type={}, userId={}, retryCount={}",
                    outbox.getType(), outbox.getUserId(), outbox.getRetryCount());

            } catch (Exception e) {
                outbox.setRetryCount(outbox.getRetryCount() + 1);
                outbox.setErrorMessage(e.getMessage());
                if (outbox.getRetryCount() >= MAX_RETRY) {
                    outbox.setStatus("FAILED");
                    log.error("[OUTBOX] 보상 최종 실패 ({}회 재시도): type={}, userId={}",
                        MAX_RETRY, outbox.getType(), outbox.getUserId());
                }
                outboxRepository.save(outbox);
            }
        }
    }
}
