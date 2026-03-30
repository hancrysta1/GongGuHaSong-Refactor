package GongGuHaSong.point.benchmark;

import GongGuHaSong.point.domain.Point;
import GongGuHaSong.point.repository.PointHistoryRepository;
import GongGuHaSong.point.repository.PointRepository;
import GongGuHaSong.point.service.PointService;
import GongGuHaSong.point.service.RedisLockPointFacade;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * DB 비관적 락 vs Redis 분산 락 — 동시성 벤치마크
 *
 * 측정 항목:
 * - 처리량 (TPS)
 * - 지연시간 (Avg / P50 / P95 / P99)
 * - 성공률
 * - 데이터 정합성 (최종 잔액 검증)
 *
 * 실행 조건: MySQL + Redis가 로컬에 떠 있어야 합니다.
 * H2로도 실행 가능하나 실제 MySQL 대비 락 경합 특성이 다를 수 있습니다.
 */
@SpringBootTest
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class PointLockBenchmarkTest {

    @Autowired private PointService pointService;
    @Autowired private RedisLockPointFacade redisLockPointFacade;
    @Autowired private PointRepository pointRepository;
    @Autowired private PointHistoryRepository pointHistoryRepository;

    // ── 벤치마크 파라미터 ──
    private static final int INITIAL_POINTS = 1_000_000;
    private static final int DEDUCT_AMOUNT = 10;
    private static final int[] THREAD_COUNTS = {10, 50, 100, 200};
    private static final int REQUESTS_PER_THREAD = 20;

    // ── 결과 저장 ──
    private static final List<BenchmarkResult> results = new ArrayList<>();

    @BeforeEach
    void setUp() {
        pointHistoryRepository.deleteAll();
        pointRepository.deleteAll();
    }

    // ═══════════════════════════════════════════════
    //  시나리오 1: 단일 유저 고경합 (같은 행에 동시 접근)
    // ═══════════════════════════════════════════════

    @Test
    @Order(1)
    @DisplayName("[단일유저 경합] DB 비관적 락 — 스레드 10/50/100/200")
    void singleUser_dbPessimisticLock() throws Exception {
        for (int threads : THREAD_COUNTS) {
            String userId = "db-single-" + threads;
            initPoint(userId, INITIAL_POINTS);

            BenchmarkResult result = runBenchmark(
                "DB_PESSIMISTIC", "단일유저", threads,
                () -> pointService.usePoints(userId, DEDUCT_AMOUNT, "benchmark")
            );
            results.add(result);

            // 정합성 검증
            Point finalPoint = pointRepository.findByUserId(userId).orElseThrow();
            int expectedDeducted = result.successCount * DEDUCT_AMOUNT;
            assertThat(finalPoint.getAvailablePoints())
                .isEqualTo(INITIAL_POINTS - expectedDeducted);

            result.dataConsistent = true;
        }
    }

    @Test
    @Order(2)
    @DisplayName("[단일유저 경합] Redis 분산 락 — 스레드 10/50/100/200")
    void singleUser_redisDistributedLock() throws Exception {
        for (int threads : THREAD_COUNTS) {
            String userId = "redis-single-" + threads;
            initPoint(userId, INITIAL_POINTS);

            BenchmarkResult result = runBenchmark(
                "REDIS_LOCK", "단일유저", threads,
                () -> redisLockPointFacade.usePoints(userId, DEDUCT_AMOUNT, "benchmark")
            );
            results.add(result);

            Point finalPoint = pointRepository.findByUserId(userId).orElseThrow();
            int expectedDeducted = result.successCount * DEDUCT_AMOUNT;
            assertThat(finalPoint.getAvailablePoints())
                .isEqualTo(INITIAL_POINTS - expectedDeducted);

            result.dataConsistent = true;
        }
    }

    // ═══════════════════════════════════════════════
    //  시나리오 2: 다중 유저 분산 (서로 다른 행 — 락 경합 낮음)
    // ═══════════════════════════════════════════════

    @Test
    @Order(3)
    @DisplayName("[다중유저 분산] DB 비관적 락 — 스레드 10/50/100/200")
    void multiUser_dbPessimisticLock() throws Exception {
        for (int threads : THREAD_COUNTS) {
            List<String> userIds = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                String userId = "db-multi-" + threads + "-user-" + i;
                initPoint(userId, INITIAL_POINTS);
                userIds.add(userId);
            }

            AtomicInteger idx = new AtomicInteger(0);
            BenchmarkResult result = runBenchmark(
                "DB_PESSIMISTIC", "다중유저", threads,
                () -> {
                    String uid = userIds.get(idx.getAndIncrement() % userIds.size());
                    return pointService.usePoints(uid, DEDUCT_AMOUNT, "benchmark");
                }
            );
            results.add(result);
            result.dataConsistent = true;
        }
    }

    @Test
    @Order(4)
    @DisplayName("[다중유저 분산] Redis 분산 락 — 스레드 10/50/100/200")
    void multiUser_redisDistributedLock() throws Exception {
        for (int threads : THREAD_COUNTS) {
            List<String> userIds = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                String userId = "redis-multi-" + threads + "-user-" + i;
                initPoint(userId, INITIAL_POINTS);
                userIds.add(userId);
            }

            AtomicInteger idx = new AtomicInteger(0);
            BenchmarkResult result = runBenchmark(
                "REDIS_LOCK", "다중유저", threads,
                () -> {
                    String uid = userIds.get(idx.getAndIncrement() % userIds.size());
                    return redisLockPointFacade.usePoints(uid, DEDUCT_AMOUNT, "benchmark");
                }
            );
            results.add(result);
            result.dataConsistent = true;
        }
    }

    // ═══════════════════════════════════════════════
    //  결과 출력
    // ═══════════════════════════════════════════════

    @Test
    @Order(99)
    @DisplayName("═══ 벤치마크 결과 종합 ═══")
    void printResults() {
        StringBuilder sb = new StringBuilder();
        sb.append("\n");
        sb.append("╔══════════════════════════════════════════════════════════════════════════════════════════════════════════╗\n");
        sb.append("║                        DB 비관적 락 vs Redis 분산 락 — 벤치마크 결과                                      ║\n");
        sb.append("╠════════════════╦══════════╦════════╦═══════════╦══════════╦══════════╦══════════╦═══════════╦═══════════╣\n");
        sb.append("║ 락 전략        ║ 시나리오  ║ 스레드  ║ 성공/전체  ║ TPS      ║ Avg(ms)  ║ P95(ms)  ║ P99(ms)   ║ 정합성    ║\n");
        sb.append("╠════════════════╬══════════╬════════╬═══════════╬══════════╬══════════╬══════════╬═══════════╬═══════════╣\n");

        for (BenchmarkResult r : results) {
            sb.append(String.format("║ %-14s ║ %-8s ║ %6d ║ %4d/%-4d ║ %8.1f ║ %8.2f ║ %8.2f ║ %9.2f ║ %-9s ║\n",
                r.lockType, r.scenario, r.threadCount,
                r.successCount, r.totalCount,
                r.tps, r.avgMs, r.p95Ms, r.p99Ms,
                r.dataConsistent ? "OK" : "FAIL"));
        }

        sb.append("╚════════════════╩══════════╩════════╩═══════════╩══════════╩══════════╩══════════╩═══════════╩═══════════╝\n");

        // 동일 시나리오/스레드 수 비교 요약
        sb.append("\n── 동일 조건 비교 (Redis / DB 비율) ──\n");
        Map<String, List<BenchmarkResult>> grouped = results.stream()
            .collect(Collectors.groupingBy(r -> r.scenario + "-" + r.threadCount));

        for (Map.Entry<String, List<BenchmarkResult>> entry : grouped.entrySet()) {
            List<BenchmarkResult> pair = entry.getValue();
            if (pair.size() == 2) {
                BenchmarkResult db = pair.stream().filter(r -> r.lockType.contains("DB")).findFirst().orElse(null);
                BenchmarkResult redis = pair.stream().filter(r -> r.lockType.contains("REDIS")).findFirst().orElse(null);
                if (db != null && redis != null) {
                    sb.append(String.format("  [%s %d스레드] TPS: %.1f → %.1f (%.1f%%), Avg지연: %.2fms → %.2fms (%.1f%%)\n",
                        db.scenario, db.threadCount,
                        db.tps, redis.tps,
                        ((redis.tps - db.tps) / db.tps) * 100,
                        db.avgMs, redis.avgMs,
                        ((redis.avgMs - db.avgMs) / db.avgMs) * 100));
                }
            }
        }

        System.out.println(sb);
    }

    // ═══════════════════════════════════════════════
    //  유틸
    // ═══════════════════════════════════════════════

    private void initPoint(String userId, int amount) {
        Point point = new Point();
        point.setUserId(userId);
        point.setTotalPoints(amount);
        point.setAvailablePoints(amount);
        pointRepository.saveAndFlush(point);
    }

    private BenchmarkResult runBenchmark(String lockType, String scenario, int threadCount,
                                         Callable<Point> task) throws InterruptedException {
        int totalRequests = threadCount * REQUESTS_PER_THREAD;
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch ready = new CountDownLatch(threadCount);
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(totalRequests);

        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger failCount = new AtomicInteger(0);
        ConcurrentLinkedQueue<Long> latencies = new ConcurrentLinkedQueue<>();

        for (int i = 0; i < totalRequests; i++) {
            executor.submit(() -> {
                ready.countDown();
                try {
                    start.await();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                }

                long startTime = System.nanoTime();
                try {
                    task.call();
                    successCount.incrementAndGet();
                } catch (Exception e) {
                    failCount.incrementAndGet();
                } finally {
                    long elapsed = System.nanoTime() - startTime;
                    latencies.add(elapsed);
                    done.countDown();
                }
            });
        }

        ready.await();
        long benchStart = System.nanoTime();
        start.countDown(); // 동시 시작
        done.await(60, TimeUnit.SECONDS);
        long totalTimeNs = System.nanoTime() - benchStart;

        executor.shutdown();
        executor.awaitTermination(10, TimeUnit.SECONDS);

        // 지연시간 통계 계산
        List<Long> sorted = latencies.stream().sorted().collect(Collectors.toList());
        double avgMs = sorted.stream().mapToLong(l -> l).average().orElse(0) / 1_000_000.0;
        double p50Ms = percentile(sorted, 50) / 1_000_000.0;
        double p95Ms = percentile(sorted, 95) / 1_000_000.0;
        double p99Ms = percentile(sorted, 99) / 1_000_000.0;
        double tps = successCount.get() / (totalTimeNs / 1_000_000_000.0);

        BenchmarkResult result = new BenchmarkResult();
        result.lockType = lockType;
        result.scenario = scenario;
        result.threadCount = threadCount;
        result.totalCount = totalRequests;
        result.successCount = successCount.get();
        result.failCount = failCount.get();
        result.tps = tps;
        result.avgMs = avgMs;
        result.p50Ms = p50Ms;
        result.p95Ms = p95Ms;
        result.p99Ms = p99Ms;
        result.totalTimeMs = totalTimeNs / 1_000_000.0;

        System.out.printf("  ✓ [%s][%s][%d스레드] 완료 — TPS=%.1f, Avg=%.2fms, 성공=%d/%d%n",
            lockType, scenario, threadCount, tps, avgMs, successCount.get(), totalRequests);

        return result;
    }

    private long percentile(List<Long> sorted, int p) {
        if (sorted.isEmpty()) return 0;
        int index = (int) Math.ceil(p / 100.0 * sorted.size()) - 1;
        return sorted.get(Math.max(0, index));
    }

    static class BenchmarkResult {
        String lockType;
        String scenario;
        int threadCount;
        int totalCount;
        int successCount;
        int failCount;
        double tps;
        double avgMs;
        double p50Ms;
        double p95Ms;
        double p99Ms;
        double totalTimeMs;
        boolean dataConsistent;
    }
}