import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';

const pointDuration = new Trend('point_duration', true);

const users = new SharedArray('users', function () {
  const arr = [];
  for (let i = 1; i <= 10000; i++) {
    arr.push(`loadtest-user-${i}`);
  }
  return arr;
});

// 10,000건, 동시 50명
export const options = {
  scenarios: {
    point_test: {
      executor: 'per-vu-iterations',
      vus: 50,
      iterations: 200,
      maxDuration: '10m',
    },
  },
};

export default function () {
  const userIndex = (__VU - 1) * 200 + __ITER;
  const userId = users[userIndex];

  // point-service REST API 직접 호출
  const payload = JSON.stringify({
    userId: userId,
    amount: 10,
    description: '부하테스트 포인트 사용',
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  const startTime = Date.now();
  const res = http.post('http://localhost:8084/point/use', payload, params);
  const duration = Date.now() - startTime;

  pointDuration.add(duration);

  check(res, {
    'status is 200': (r) => r.status === 200,
  });
}
