import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// ── 커스텀 메트릭 ──
const paymentDuration = new Trend('payment_duration', true);
const successRate = new Rate('payment_success_rate');
const failureCounter = new Counter('payment_failures');
const pointInconsistency = new Counter('point_inconsistency');
const overdraftCounter = new Counter('overdraft_detected');
const rollbackMissing = new Counter('rollback_missing');
const totalRequests = new Counter('total_requests');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8085';
const POINT_URL = __ENV.POINT_URL || 'http://localhost:8084';
const REPLICAS = __ENV.REPLICAS || '1';

// ── 시나리오: 단계적 부하 50 → 100 → 200 → 300명 ──
// 로컬 환경에 맞춰 기존 테스트와 동일한 부하
export const options = {
  scenarios: {
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '1m',  target: 100 },
        { duration: '1m',  target: 200 },
        { duration: '1m',  target: 300 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    'payment_duration': ['p(95)<5000'],
    'payment_success_rate': ['rate>0.90'],
    'point_inconsistency': ['count<1'],
    'overdraft_detected': ['count<1'],
    'rollback_missing': ['count<1'],
  },
};

export function setup() {
  const headers = { 'Content-Type': 'application/json' };

  console.log(`=== 스케일 아웃 비교 테스트 (replicas=${REPLICAS}) ===`);
  console.log('비교 지표: 처리량(RPS), 응답시간(p50/p95/p99), 성공률, 정합성');
  console.log('======================================================');

  // 500명 사용자에게 각각 50000 포인트 적립 (여유있게)
  for (let i = 1; i <= 500; i++) {
    http.post(`${POINT_URL}/point/earn`, JSON.stringify({
      userId: `scale-user-${i}`,
      amount: 50000,
      description: `스케일아웃 테스트 초기 포인트 (${REPLICAS} replicas)`
    }), { headers });
  }
  console.log(`포인트 초기화 완료: 500명 x 50,000P`);

  return { replicas: REPLICAS };
}

export default function () {
  const userId = `scale-user-${(__VU % 500) + 1}`;
  const headers = { 'Content-Type': 'application/json' };
  const pointUsed = 100;

  // Step 1: 결제 전 포인트 잔액
  const beforeRes = http.get(`${POINT_URL}/point/${userId}`, { headers });
  let pointsBefore = 0;
  if (beforeRes.status === 200) {
    try { pointsBefore = JSON.parse(beforeRes.body).availablePoints || 0; } catch(e) {}
  }

  const usePoints = pointsBefore >= pointUsed;
  const method = usePoints ? 'POINT' : 'BANK_TRANSFER';

  // Step 2: 결제 요청
  const start = Date.now();
  const payRes = http.post(`${BASE_URL}/payment`, JSON.stringify({
    orderId: `order-${__VU}-${__ITER}-${Date.now()}`,
    userId: userId,
    title: '스케일아웃 테스트 상품',
    quantity: 1,
    unitPrice: pointUsed,
    pointUsed: usePoints ? pointUsed : 0,
    paymentMethod: method,
    cardId: null,
  }), { headers });

  const elapsed = Date.now() - start;
  paymentDuration.add(elapsed);
  totalRequests.add(1);

  const success = payRes.status === 200;
  successRate.add(success);
  if (!success) failureCounter.add(1);

  // Step 3: 정합성 검증
  if (usePoints) {
    const afterRes = http.get(`${POINT_URL}/point/${userId}`, { headers });
    if (afterRes.status === 200) {
      try {
        const pointsAfter = JSON.parse(afterRes.body).availablePoints;

        if (success) {
          if (pointsAfter > pointsBefore - pointUsed) pointInconsistency.add(1);
          if (pointsAfter < pointsBefore - pointUsed) pointInconsistency.add(1);
        } else {
          if (pointsAfter < pointsBefore) rollbackMissing.add(1);
        }

        if (pointsAfter < 0) overdraftCounter.add(1);
      } catch(e) {}
    }
  }

  sleep(0.05);
}

export function teardown(data) {
  console.log(`=== 테스트 완료 (replicas=${data.replicas}) ===`);
  console.log('k6 summary에서 아래 지표를 비교하세요:');
  console.log('  payment_duration p50/p95/p99 — 응답시간');
  console.log('  total_requests             — 총 처리량');
  console.log('  payment_success_rate       — 성공률');
  console.log('  point_inconsistency        — 데이터 정합성');
  console.log('================================================');
}
