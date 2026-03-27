import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

const paymentDuration = new Trend('payment_duration', true);
const successRate = new Rate('payment_success_rate');
const failureCounter = new Counter('payment_failures');
const pointInconsistency = new Counter('point_inconsistency');
const overdraftCounter = new Counter('overdraft_detected');
const totalRequests = new Counter('total_requests');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:30085';
const POINT_URL = __ENV.POINT_URL || 'http://localhost:30084';

// 50 → 500 → 1000 → 3000 → 5000명
export const options = {
  scenarios: {
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '1m',  target: 500 },
        { duration: '1m',  target: 1000 },
        { duration: '1m',  target: 2000 },
        { duration: '1m',  target: 3000 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    'point_inconsistency': ['count<1'],
    'overdraft_detected': ['count<1'],
  },
  setupTimeout: '300s',
};

export function setup() {
  const headers = { 'Content-Type': 'application/json' };

  console.log('=== 동시성 검증 테스트 (최대 5000명) ===');
  console.log('장애 주입 없음. 순수 동시성만 검증.');
  console.log('=========================================');

  // 500명만 초기화, VU는 모듈로 재사용
  for (let i = 1; i <= 500; i++) {
    http.post(`${POINT_URL}/point/earn`, JSON.stringify({
      userId: `conc-user-${i}`,
      amount: 1000000,
      description: '동시성 테스트 초기 포인트'
    }), { headers });
  }
  console.log('포인트 초기화 완료: 500명 x 1,000,000P');

  return {};
}

export default function () {
  const userId = `conc-user-${(__VU % 500) + 1}`;
  const headers = { 'Content-Type': 'application/json' };
  const pointUsed = 100;

  const beforeRes = http.get(`${POINT_URL}/point/${userId}`, { headers });
  let pointsBefore = 0;
  if (beforeRes.status === 200) {
    try { pointsBefore = JSON.parse(beforeRes.body).availablePoints || 0; } catch(e) {}
  }

  const usePoints = pointsBefore >= pointUsed;
  const method = usePoints ? 'POINT' : 'BANK_TRANSFER';

  const start = Date.now();
  const payRes = http.post(`${BASE_URL}/payment`, JSON.stringify({
    orderId: `order-${__VU}-${__ITER}-${Date.now()}`,
    userId: userId,
    title: '동시성테스트 상품',
    quantity: 1,
    unitPrice: pointUsed,
    pointUsed: usePoints ? pointUsed : 0,
    paymentMethod: method,
    cardId: null,
  }), { headers });

  paymentDuration.add(Date.now() - start);
  totalRequests.add(1);

  const success = payRes.status === 200;
  successRate.add(success);
  if (!success) failureCounter.add(1);

  if (usePoints) {
    const afterRes = http.get(`${POINT_URL}/point/${userId}`, { headers });
    if (afterRes.status === 200) {
      try {
        const pointsAfter = JSON.parse(afterRes.body).availablePoints;

        if (success) {
          if (pointsAfter > pointsBefore - pointUsed) pointInconsistency.add(1);
          if (pointsAfter < pointsBefore - pointUsed) pointInconsistency.add(1);
        }

        if (pointsAfter < 0) overdraftCounter.add(1);
      } catch(e) {}
    }
  }

  sleep(0.02);
}

export function teardown(data) {
  console.log('=== 테스트 완료 ===');
  console.log('point_inconsistency: 0이면 → SELECT FOR UPDATE 정상');
  console.log('overdraft_detected:  0이면 → 마이너스 잔액 없음');
  console.log('====================');
}
