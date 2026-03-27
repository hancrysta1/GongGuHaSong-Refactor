import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// ── 핵심 메트릭: SAGA 부재 문제 정량화 ──
const paymentDuration = new Trend('payment_duration', true);
const successRate = new Rate('payment_success_rate');
const failureCounter = new Counter('payment_failures');
const pointInconsistency = new Counter('point_inconsistency');   // 포인트 이중차감 or 미차감
const overdraftCounter = new Counter('overdraft_detected');       // 마이너스 잔액
const rollbackMissing = new Counter('rollback_missing');          // 결제 실패인데 포인트 차감됨

// payment-service 직접 호출 (게이트웨이 오버헤드 제거)
const PAYMENT_URL = 'http://localhost:8085';
const POINT_URL = 'http://localhost:8084';

// ── 단계적 부하: 50 → 200 → 500 → 1000명 ──
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
    spike: {
      executor: 'constant-vus',
      vus: 500,
      duration: '30s',
      startTime: '4m30s',
    },
  },
  thresholds: {
    'payment_duration': ['p(95)<5000'],
    'payment_success_rate': ['rate>0.80'],
    // 이 threshold들이 FAIL이면 = SAGA 필요 증명
    'point_inconsistency': ['count<1'],
    'overdraft_detected': ['count<1'],
    'rollback_missing': ['count<1'],
  },
};

export function setup() {
  console.log('=== SAGA 도입 정당성 부하 테스트 ===');
  console.log('사전 조건: saga-user-1 ~ 1000 각 50,000P 충전됨');
  console.log('검증: 동시 결제 시 포인트 정합성/롤백 누락');
  console.log('====================================');
  return {};
}

export default function () {
  // VU 1~1000 → saga-user-1~1000 (1000명 넘으면 재사용)
  const userNum = ((__VU - 1) % 1000) + 1;
  const userId = `saga-user-${userNum}`;
  const headers = { 'Content-Type': 'application/json' };
  const pointUsed = 100;

  // ── 1. 결제 전 포인트 잔액 ──
  const beforeRes = http.get(`${POINT_URL}/point/${userId}`);
  let pointsBefore = 0;
  if (beforeRes.status === 200) {
    try { pointsBefore = JSON.parse(beforeRes.body).availablePoints || 0; } catch(e) {}
  }

  // 포인트 부족하면 BANK_TRANSFER (포인트 안 씀)
  const usePoints = pointsBefore >= pointUsed;
  const method = usePoints ? 'POINT' : 'BANK_TRANSFER';

  // ── 2. 결제 요청 ──
  const start = Date.now();
  const payRes = http.post(`${PAYMENT_URL}/payment`, JSON.stringify({
    orderId: `saga-${__VU}-${__ITER}-${Date.now()}`,
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

  // ── 3. 결제 후 정합성 검증 ──
  if (usePoints) {
    // 약간의 딜레이 후 조회 (비동기 처리 여유)
    sleep(0.01);
    const afterRes = http.get(`${POINT_URL}/point/${userId}`);
    if (afterRes.status === 200) {
      try {
        const pointsAfter = JSON.parse(afterRes.body).availablePoints;
        const expected = pointsBefore - pointUsed;

        if (success) {
          // 결제 성공했는데 포인트가 안 맞음
          if (pointsAfter !== expected) {
            pointInconsistency.add(1);
          }
        } else {
          // 결제 실패했는데 포인트가 차감됨 = 롤백 누락!
          if (pointsAfter < pointsBefore) {
            rollbackMissing.add(1);
          }
        }

        // 마이너스 잔액
        if (pointsAfter < 0) {
          overdraftCounter.add(1);
        }
      } catch(e) {}
    }
  }

  sleep(0.02);
}

export function teardown(data) {
  console.log('');
  console.log('========================================');
  console.log('  SAGA 도입 정당성 테스트 결과 요약');
  console.log('========================================');
  console.log('  point_inconsistency > 0 → 동시성 제어 필요');
  console.log('  overdraft_detected  > 0 → 잔액 race condition');
  console.log('  rollback_missing    > 0 → SAGA 보상 트랜잭션 필수');
  console.log('');
  console.log('  ✗ threshold 실패 = SAGA 도입 근거 확보');
  console.log('========================================');
}
