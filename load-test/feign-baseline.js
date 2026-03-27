import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// 커스텀 메트릭
const paymentDuration = new Trend('payment_duration', true);
const paymentErrors = new Counter('payment_errors');

// 10,000명 유저 목록 (각 유저당 1건만 결제)
const users = new SharedArray('users', function () {
  const arr = [];
  for (let i = 1; i <= 10000; i++) {
    arr.push(`loadtest-user-${i}`);
  }
  return arr;
});

// 총 10,000건, 동시 50명
export const options = {
  scenarios: {
    payment_test: {
      executor: 'per-vu-iterations',
      vus: 50,
      iterations: 200,       // 50명 × 200건 = 10,000건
      maxDuration: '10m',
    },
  },
};

export default function () {
  // 각 VU가 고유한 유저를 사용 (VU 0~49 × iteration 0~199 = 0~9999)
  const userIndex = (__VU - 1) * 200 + __ITER;
  const userId = users[userIndex];

  const payload = JSON.stringify({
    orderId: `order-${userId}-${Date.now()}`,
    userId: userId,
    title: '부하테스트 공구상품',
    quantity: 1,
    unitPrice: 10000,
    pointUsed: 100,
    paymentMethod: 'CARD',
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  const startTime = Date.now();
  const res = http.post('http://localhost:8085/payment', payload, params);
  const duration = Date.now() - startTime;

  paymentDuration.add(duration);

  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'has paymentId': (r) => {
      try {
        return JSON.parse(r.body).id !== undefined;
      } catch (e) {
        return false;
      }
    },
  });

  if (!success) {
    paymentErrors.add(1);
  }
}
