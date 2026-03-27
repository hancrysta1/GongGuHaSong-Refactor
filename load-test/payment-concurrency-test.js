import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// ── 커스텀 메트릭 ──
const paymentDuration = new Trend('payment_duration', true);
const successRate = new Rate('payment_success_rate');
const failureCounter = new Counter('payment_failures');
const pointInconsistency = new Counter('point_inconsistency');
const overdraftCounter = new Counter('overdraft_detected');
const rollbackMissing = new Counter('rollback_missing');  // 결제 실패했는데 포인트 안 돌아온 건수

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

// ── 시나리오: 단계적 부하 50 → 200 → 500 → 1000명 ──
export const options = {
  scenarios: {
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '1m',  target: 200 },
        { duration: '1m',  target: 500 },
        { duration: '1m',  target: 1000 },
        { duration: '30s', target: 0 },
      ],
    },
    // 인기 공구 오픈 스파이크 (ramp_up 끝난 후)
    spike: {
      executor: 'constant-vus',
      vus: 500,
      duration: '30s',
      startTime: '4m30s',
    },
  },
  thresholds: {
    'payment_duration': ['p(95)<3000'],
    'payment_success_rate': ['rate>0.90'],
    'point_inconsistency': ['count<1'],
    'overdraft_detected': ['count<1'],
    'rollback_missing': ['count<1'],
  },
};

// ── 테스트 전 포인트 초기화 ──
export function setup() {
  const headers = { 'Content-Type': 'application/json' };

  console.log('=== SAGA 도입 근거 부하 테스트 ===');
  console.log('검증 항목:');
  console.log('  1. 동시 결제 시 포인트 이중 차감 (point_inconsistency)');
  console.log('  2. 마이너스 잔액 발생 여부 (overdraft_detected)');
  console.log('  3. 결제 실패 시 포인트 롤백 누락 (rollback_missing)');
  console.log('  4. 최대 1000명 동시 결제 응답 시간');
  console.log('===================================');

  // 1000명 사용자에게 각각 10000 포인트 적립
  for (let i = 1; i <= 1000; i++) {
    http.post(`${BASE_URL}/point/earn`, JSON.stringify({
      userId: `loadtest-user-${i}`,
      amount: 10000,
      description: '부하테스트 초기 포인트'
    }), { headers });
  }
  console.log('포인트 초기화 완료: 1000명 x 10,000P');

  return {};
}

export default function () {
  const userId = `loadtest-user-${__VU}`;
  const headers = { 'Content-Type': 'application/json' };
  const pointUsed = 100;

  // ── Step 1: 결제 전 포인트 잔액 ──
  const beforeRes = http.get(`${BASE_URL}/point/${userId}`, { headers });
  let pointsBefore = 0;
  if (beforeRes.status === 200) {
    try { pointsBefore = JSON.parse(beforeRes.body).availablePoints || 0; } catch(e) {}
  }

  // 포인트 부족하면 BANK_TRANSFER로 (포인트 안 씀)
  const usePoints = pointsBefore >= pointUsed;
  const method = usePoints ? 'POINT' : 'BANK_TRANSFER';

  // ── Step 2: 결제 요청 ──
  const start = Date.now();
  const payRes = http.post(`${BASE_URL}/payment`, JSON.stringify({
    orderId: `order-${__VU}-${__ITER}-${Date.now()}`,
    userId: userId,
    title: '동시성테스트 공구상품',
    quantity: 1,
    unitPrice: pointUsed,
    pointUsed: usePoints ? pointUsed : 0,
    paymentMethod: method,
    cardId: null,
  }), { headers });

  paymentDuration.add(Date.now() - start);

  const success = payRes.status === 200;
  successRate.add(success);
  if (!success) failureCounter.add(1);

  // ── Step 3: 결제 후 정합성 검증 ──
  if (usePoints) {
    const afterRes = http.get(`${BASE_URL}/point/${userId}`, { headers });
    if (afterRes.status === 200) {
      try {
        const pointsAfter = JSON.parse(afterRes.body).availablePoints;

        if (success) {
          // 결제 성공: 포인트가 정확히 차감되었는지
          if (pointsAfter > pointsBefore - pointUsed) {
            pointInconsistency.add(1); // 차감 안 됨
          }
          if (pointsAfter < pointsBefore - pointUsed) {
            pointInconsistency.add(1); // 이중 차감
          }
        } else {
          // 결제 실패: 포인트가 원래대로 복구되었는지
          if (pointsAfter < pointsBefore) {
            rollbackMissing.add(1); // 결제 실패했는데 포인트 차감됨 = 롤백 누락!
          }
        }

        // 마이너스 잔액
        if (pointsAfter < 0) {
          overdraftCounter.add(1);
        }
      } catch(e) {}
    }
  }

  sleep(0.05);
}

export function teardown(data) {
  console.log('=== 테스트 완료 ===');
  console.log('핵심 지표 확인:');
  console.log('  point_inconsistency: 0이 아니면 → 동시성 제어 필요');
  console.log('  overdraft_detected:  0이 아니면 → 잔액 검증 race condition');
  console.log('  rollback_missing:    0이 아니면 → SAGA 보상 트랜잭션 필수');
  console.log('===================');
}
