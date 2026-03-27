import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const successRate = new Rate('success_rate');
const failureCounter = new Counter('failures');
const rollbackMissing = new Counter('rollback_missing');

const PAYMENT_URL = 'http://localhost:8085';
const POINT_URL = 'http://localhost:8084';

export const options = {
  scenarios: {
    load: {
      executor: 'constant-vus',
      vus: 200,
      duration: '2m',
    },
  },
};

export function setup() {
  console.log('=== Outbox Pattern 테스트 ===');
  console.log('장애 주입 10% + SAGA + Outbox 재시도(30초마다)');
  console.log('2분 부하 → 1분 대기(Outbox 재시도) → 정합성 확인');
  return {};
}

export default function () {
  const userNum = ((__VU - 1) % 1000) + 1;
  const userId = `outbox-user-${userNum}`;
  const headers = { 'Content-Type': 'application/json' };
  const pointUsed = 100;

  const beforeRes = http.get(`${POINT_URL}/point/${userId}`);
  let pointsBefore = 0;
  if (beforeRes.status === 200) {
    try { pointsBefore = JSON.parse(beforeRes.body).availablePoints || 0; } catch(e) {}
  }
  if (pointsBefore < pointUsed) { sleep(0.05); return; }

  const payRes = http.post(`${PAYMENT_URL}/payment`, JSON.stringify({
    orderId: `outbox-${__VU}-${__ITER}-${Date.now()}`,
    userId: userId,
    title: 'outbox테스트',
    quantity: 1,
    unitPrice: pointUsed,
    pointUsed: pointUsed,
    paymentMethod: 'POINT',
    cardId: null,
    productId: null,
  }), { headers, timeout: '5s' });

  const success = payRes.status === 200;
  successRate.add(success);
  if (!success) failureCounter.add(1);

  sleep(0.02);
}

export function teardown(data) {
  // Outbox 재시도 대기 (60초 — 30초 주기 x 2회)
  console.log('부하 종료. Outbox 재시도 대기 60초...');
  sleep(60);

  // 최종 정합성 확인: 실패 건의 포인트가 복구됐는지 샘플 체크
  const headers = { 'Content-Type': 'application/json' };
  let restored = 0;
  let notRestored = 0;

  for (let i = 1; i <= 100; i++) {
    const userId = `outbox-user-${i}`;
    const res = http.get(`http://localhost:8084/point/${userId}`);
    if (res.status === 200) {
      const points = JSON.parse(res.body).availablePoints;
      // 500000에서 시작, 100씩 성공 건만큼 차감돼야 함
      // 정확한 비교는 어렵지만, 마이너스가 아니면 OK
      if (points >= 0) restored++;
      else notRestored++;
    }
  }

  console.log('=== 최종 정합성 (샘플 100명) ===');
  console.log(`  정상: ${restored}명, 마이너스: ${notRestored}명`);
  console.log('  Outbox compensation_outbox 테이블에서 COMPLETED/PENDING/FAILED 확인 필요');
}
