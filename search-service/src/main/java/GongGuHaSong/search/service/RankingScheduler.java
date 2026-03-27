package GongGuHaSong.search.service;

import GongGuHaSong.search.domain.SearchRanking;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class RankingScheduler {

    private final SearchService searchService;
    private final SimpMessagingTemplate messagingTemplate;

    private List<SearchRanking> previousRankings;

    /**
     * 폴백 스케줄러: 60초마다 실행 (주 갱신은 Kafka 이벤트 드리븐)
     * 검색 이벤트 등 Kafka를 타지 않는 변동분을 보정하는 용도
     */
    @Scheduled(fixedRate = 60000)
    public void broadcastRankings() {
        try {
            List<SearchRanking> currentRankings = searchService.calculateRankings();

            // 이전 순위와 비교하여 변동 방향 설정
            if (previousRankings != null) {
                for (SearchRanking current : currentRankings) {
                    boolean found = false;
                    for (SearchRanking prev : previousRankings) {
                        if (current.getKeyword().equals(prev.getKeyword())) {
                            found = true;
                            if (current.getRank() < prev.getRank()) {
                                current.setChangeDirection("UP");
                            } else if (current.getRank() > prev.getRank()) {
                                current.setChangeDirection("DOWN");
                            } else {
                                current.setChangeDirection("SAME");
                            }
                            break;
                        }
                    }
                    if (!found) {
                        current.setChangeDirection("NEW");
                    }
                }
            }

            previousRankings = currentRankings;

            // WebSocket으로 전송
            messagingTemplate.convertAndSend("/topic/rankings", currentRankings);
            log.debug("폴백 랭킹 갱신 전송: {}개", currentRankings.size());

        } catch (Exception e) {
            log.error("실시간 검색 순위 갱신 실패: {}", e.getMessage());
        }
    }
}
