import http from 'k6/http';
import { sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

// ── SAGA Before: 보상 없이 장애 주입 ──
// 1인 1결제, 서버 내부에서 10% 확률로 장애 발생
// SAGA 보상 비활성화 상태에서 실행
// 검증: 결제 실패 시 포인트가 유실되는가?

const rollbackMissing = new Counter('rollback_missing');
const overdraftCounter = new Counter('overdraft_detected');
const successRate = new Rate('success_rate');
const failureCounter = new Counter('failures');

const PAYMENT_URL = 'http://localhost:8085';
const POINT_URL = 'http://localhost:8084';

export const options = {
  teardownTimeout: '300s',
  scenarios: {
    s50: {
      executor: 'constant-vus',
      vus: 50,
      duration: '1m',
      startTime: '0s',
    },
    s100: {
      executor: 'constant-vus',
      vus: 100,
      duration: '1m',
      startTime: '1m30s',
    },
    s200: {
      executor: 'constant-vus',
      vus: 200,
      duration: '1m',
      startTime: '3m',
    },
    s300: {
      executor: 'constant-vus',
      vus: 300,
      duration: '1m',
      startTime: '4m30s',
    },
  },
  thresholds: {
    'rollback_missing': ['count<1'],
    'overdraft_detected': ['count<1'],
  },
};

export function setup() {
  console.log('==============================================');
  console.log('  SAGA Before: 보상 없음 + 장애 주입 10%');
  console.log('  50 → 100 → 200 → 300명 (각 1분)');
  console.log('  1인 1결제');
  console.log('  ✗ rollback_missing > 0 = SAGA 필요성 증명');
  console.log('==============================================');
  return {};
}

export default function () {
  const userId = `saga-before-${__VU}-${__ITER}`;
  const headers = { 'Content-Type': 'application/json' };
  const pointUsed = 100;

  // 새 유저 포인트 충전
  http.post(`${POINT_URL}/point/earn`, JSON.stringify({
    userId: userId,
    amount: 10000,
    description: '부하테스트'
  }), { headers, timeout: '5s' });

  // 결제 전 잔액
  const beforeRes = http.get(`${POINT_URL}/point/${userId}`, { timeout: '5s' });
  let pointsBefore = -1;
  if (beforeRes.status === 200) {
    try { pointsBefore = JSON.parse(beforeRes.body).availablePoints; } catch(e) {}
  }
  if (pointsBefore < pointUsed) { sleep(0.05); return; }

  // 결제 요청 — 타임아웃 3초로 장애 유도
  const start = Date.now();
  const payRes = http.post(`${PAYMENT_URL}/payment`, JSON.stringify({
    orderId: `before-${__VU}-${__ITER}-${Date.now()}`,
    userId: userId,
    title: 'SAGA테스트',
    quantity: 1,
    unitPrice: pointUsed,
    pointUsed: pointUsed,
    paymentMethod: 'POINT',
    cardId: null,
  }), { headers, timeout: '10s' });

  const dur = Date.now() - start;
  const success = payRes.status === 200;
  successRate.add(success);
  if (!success) failureCounter.add(1);

  // 보상 완료 대기 후 정합성 검증
  sleep(1);
  const afterRes = http.get(`${POINT_URL}/point/${userId}`, { timeout: '5s' });
  if (afterRes.status === 200) {
    try {
      const pointsAfter = JSON.parse(afterRes.body).availablePoints;

      if (!success && pointsAfter < pointsBefore) {
        const lost = pointsBefore - pointsAfter;
        rollbackMissing.add(1);
        console.log(`[ROLLBACK_MISSING] user=${userId} lost=${lost}P status=${payRes.status} dur=${dur}ms`);
      }

      if (pointsAfter < 0) {
        overdraftCounter.add(1);
        console.log(`[OVERDRAFT] user=${userId} balance=${pointsAfter}`);
      }
    } catch(e) {}
  }

  sleep(0.1);
}

export function teardown() {
  console.log('');
  console.log('');
  console.log('최종 정합성 확인 대기 60초...');
  sleep(60);

  let lost = 0;
  for (let vu = 1; vu <= 300; vu++) {
    for (let iter = 0; iter <= 30; iter++) {
      const res = http.get(`${POINT_URL}/point/saga-before-${vu}-${iter}`, { timeout: '5s' });
      if (res.status === 200) {
        try { if (JSON.parse(res.body).availablePoints < 9900) lost++; } catch(e) {}
      }
    }
  }
  console.log(`===k6 test 후 DB 조회 최종 - 유실 ${lost}건`);
}
