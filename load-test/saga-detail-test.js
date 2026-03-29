import http from 'k6/http';
import { sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

const paymentDuration = new Trend('payment_duration', true);
const successRate = new Rate('success_rate');
const failureCounter = new Counter('failures');
const rollbackMissing = new Counter('rollback_missing');
const overdraftCounter = new Counter('overdraft_detected');

const PAYMENT_URL = 'http://localhost:8085';
const POINT_URL = 'http://localhost:8084';

// ── SAGA 보상 트랜잭션 검증 ──
// 시나리오: 300명이 동시에 각자 1건 결제 (1인 1결제)
// 타임아웃 3초: 포인트 차감 후 DB 저장 전에 타임아웃 유발 → 결제 실패 유도
// 검증: 결제 실패 시 포인트가 복구되는가?
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
    'overdraft_detected': ['count<1'],
  },
};

export function setup() {
  console.log('==============================================');
  console.log('  SAGA 보상 트랜잭션 검증');
  console.log('  50 → 100 → 200 → 300명 (각 1분)');
  console.log('  1인 1결제 · 타임아웃 3초로 결제 실패 유도');
  console.log('  rollback_missing = 결제 실패 + 포인트 유실');
  console.log('==============================================');
  return {};
}

export default function () {
  // 1인 1결제: VU-ITER 조합으로 유저 완전 분리
  const userId = `saga-${__VU}-${__ITER}`;
  const headers = { 'Content-Type': 'application/json' };
  const pointUsed = 100;

  // 0. 새 유저 포인트 충전
  http.post(`${POINT_URL}/point/earn`, JSON.stringify({
    userId: userId,
    amount: 10000,
    description: '부하테스트 포인트'
  }), { headers, timeout: '5s' });

  // 1. 결제 전 잔액 스냅샷
  const beforeRes = http.get(`${POINT_URL}/point/${userId}`, { timeout: '5s' });
  let pointsBefore = -1;
  if (beforeRes.status === 200) {
    try { pointsBefore = JSON.parse(beforeRes.body).availablePoints; } catch(e) {}
  }
  if (pointsBefore < pointUsed) { sleep(0.05); return; }

  // 2. 결제 요청 — 타임아웃 3초
  const start = Date.now();
  const payRes = http.post(`${PAYMENT_URL}/payment`, JSON.stringify({
    orderId: `saga-${__VU}-${__ITER}-${Date.now()}`,
    userId: userId,
    title: '공구테스트 상품',
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

  // 3. 결제 후 정합성 검증 — 이 유저는 나만 사용하므로 오차 없음
  const afterRes = http.get(`${POINT_URL}/point/${userId}`, { timeout: '5s' });
  if (afterRes.status === 200) {
    try {
      const pointsAfter = JSON.parse(afterRes.body).availablePoints;

      // 결제 실패인데 포인트 차감됨 = SAGA 보상 누락
      if (!success && pointsAfter < pointsBefore) {
        const lost = pointsBefore - pointsAfter;
        rollbackMissing.add(1);
        console.log(`[ROLLBACK_MISSING] user=${userId} before=${pointsBefore} after=${pointsAfter} lost=${lost}P status=${payRes.status} dur=${dur}ms`);
      }

      if (pointsAfter < 0) {
        overdraftCounter.add(1);
        console.log(`[OVERDRAFT] user=${userId} balance=${pointsAfter}`);
      }
    } catch(e) {}
  }

  sleep(0.1);
}

export function teardown(data) {
  console.log('');
  console.log('==============================================');
  console.log('  결과');
  console.log('  rollback_missing = 0 → SAGA 보상 정상');
  console.log('  overdraft_detected = 0 → 마이너스 잔액 없음');
  console.log('==============================================');
}
