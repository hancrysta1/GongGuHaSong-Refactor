import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

const paymentDuration = new Trend('payment_duration', true);
const successRate = new Rate('success_rate');
const failureCounter = new Counter('failures');
const rollbackMissing = new Counter('rollback_missing');
const pointInconsistency = new Counter('point_inconsistency');
const overdraftCounter = new Counter('overdraft_detected');

const PAYMENT_URL = 'http://localhost:8085';
const POINT_URL = 'http://localhost:8084';

// ── 구간별 독립 시나리오 ──
// 핵심: 타임아웃 3초로 짧게 → 포인트 차감 후 DB 저장 전에 타임아웃 유발
export const options = {
  scenarios: {
    s50: {
      executor: 'constant-vus',
      vus: 50,
      duration: '1m',
      startTime: '0s',
      tags: { stage: '50vus' },
    },
    s100: {
      executor: 'constant-vus',
      vus: 100,
      duration: '1m',
      startTime: '1m30s',
      tags: { stage: '100vus' },
    },
    s200: {
      executor: 'constant-vus',
      vus: 200,
      duration: '1m',
      startTime: '3m',
      tags: { stage: '200vus' },
    },
    s300: {
      executor: 'constant-vus',
      vus: 300,
      duration: '1m',
      startTime: '4m30s',
      tags: { stage: '300vus' },
    },
  },
  thresholds: {
    'rollback_missing': ['count<1'],
    'point_inconsistency': ['count<1'],
    'overdraft_detected': ['count<1'],
  },
};

export function setup() {
  console.log('=========================================');
  console.log('  SAGA 누락 상세 테스트');
  console.log('  구간: 50 → 100 → 200 → 300명 (각 1분)');
  console.log('  타임아웃: 3초 (부분 실패 유도)');
  console.log('=========================================');
  return {};
}

export default function () {
  const userNum = ((__VU - 1) % 1000) + 1;
  const userId = `saga-user-${userNum}`;
  const headers = { 'Content-Type': 'application/json' };
  const pointUsed = 100;

  // 1. 결제 전 포인트 잔액 스냅샷
  const beforeRes = http.get(`${POINT_URL}/point/${userId}`, { timeout: '5s' });
  let pointsBefore = -1;
  if (beforeRes.status === 200) {
    try { pointsBefore = JSON.parse(beforeRes.body).availablePoints; } catch(e) {}
  }

  if (pointsBefore < pointUsed) {
    sleep(0.05);
    return;
  }

  // 2. 결제 요청 — 타임아웃 3초 (포인트 차감 후 DB 저장 전 타임아웃 유도)
  const start = Date.now();
  const payRes = http.post(`${PAYMENT_URL}/payment`, JSON.stringify({
    orderId: `detail-${__VU}-${__ITER}-${Date.now()}`,
    userId: userId,
    title: '상세테스트 공구상품',
    quantity: 1,
    unitPrice: pointUsed,
    pointUsed: pointUsed,
    paymentMethod: 'POINT',
    cardId: null,
  }), { headers, timeout: '3s' });

  const dur = Date.now() - start;
  paymentDuration.add(dur);

  const success = payRes.status === 200;
  successRate.add(success);
  if (!success) failureCounter.add(1);

  // 3. 결제 후 즉시 정합성 검증
  const afterRes = http.get(`${POINT_URL}/point/${userId}`, { timeout: '5s' });
  if (afterRes.status === 200) {
    try {
      const pointsAfter = JSON.parse(afterRes.body).availablePoints;

      if (success) {
        if (pointsAfter !== pointsBefore - pointUsed) {
          pointInconsistency.add(1);
          console.log(`[INCONSISTENCY] user=${userId} before=${pointsBefore} after=${pointsAfter} expected=${pointsBefore - pointUsed} stage=${__ENV.K6_SCENARIO || ''}`);
        }
      } else {
        // ★ 결제 실패인데 포인트 차감됨 = SAGA 없어서 롤백 안 됨
        if (pointsAfter < pointsBefore) {
          const lost = pointsBefore - pointsAfter;
          rollbackMissing.add(1);
          console.log(`[ROLLBACK_MISSING] user=${userId} before=${pointsBefore} after=${pointsAfter} lost=${lost}P httpStatus=${payRes.status} duration=${dur}ms`);
        }
      }

      if (pointsAfter < 0) {
        overdraftCounter.add(1);
        console.log(`[OVERDRAFT] user=${userId} balance=${pointsAfter}`);
      }
    } catch(e) {}
  }

  sleep(0.02);
}

export function teardown(data) {
  console.log('');
  console.log('=========================================');
  console.log('  결과 요약');
  console.log('  [ROLLBACK_MISSING] 로그 = 결제 실패 + 포인트 유실');
  console.log('  이 건수가 곧 SAGA 보상 트랜잭션 부재의 증거');
  console.log('=========================================');
}
