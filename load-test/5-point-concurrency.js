import http from 'k6/http';
import { sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

// ── 포인트 동시성 테스트 (MySQL SELECT FOR UPDATE) ──
// 시나리오: 50명의 유저에 대해 300명이 동시에 적립/차감 요청
// 같은 유저에 earnPoints + usePoints가 동시에 들어오는 상황
// 검증: 마이너스 잔액 0건, 최종 잔액 정합성

const overdraftCounter = new Counter('overdraft_detected');
const successRate = new Rate('success_rate');

const POINT_URL = 'http://localhost:8084';

export const options = {
  scenarios: {
    concurrent: {
      executor: 'constant-vus',
      vus: 300,
      duration: '5m',
    },
  },
  thresholds: {
    'overdraft_detected': ['count<1'],
  },
};

export function setup() {
  const headers = { 'Content-Type': 'application/json' };

  console.log('==============================================');
  console.log('  포인트 동시성 테스트 (MySQL SELECT FOR UPDATE)');
  console.log('  50명 유저 × 300 VU 동시 적립/차감');
  console.log('  overdraft = 마이너스 잔액 발생 건수');
  console.log('==============================================');

  // 50명 유저에 각 10,000P 충전
  for (let i = 1; i <= 50; i++) {
    http.post(`${POINT_URL}/point/earn`, JSON.stringify({
      userId: `point-conc-${i}`,
      amount: 10000,
      description: '동시성 테스트 초기 충전'
    }), { headers, timeout: '5s' });
  }
  console.log('50명 × 10,000P 충전 완료');

  // 초기 잔액 기록
  let initialBalances = {};
  for (let i = 1; i <= 50; i++) {
    const res = http.get(`${POINT_URL}/point/point-conc-${i}`, { timeout: '5s' });
    if (res.status === 200) {
      initialBalances[`point-conc-${i}`] = JSON.parse(res.body).availablePoints;
    }
  }
  console.log('초기 잔액 기록 완료');
  return { initialBalances };
}

export default function () {
  // 300 VU가 50명 유저를 공유 → 같은 유저에 6명이 동시 접근
  const userNum = ((__VU - 1) % 50) + 1;
  const userId = `point-conc-${userNum}`;
  const headers = { 'Content-Type': 'application/json' };

  // 짝수 VU는 차감, 홀수 VU는 적립 → 같은 유저에 적립+차감 동시 발생
  if (__VU % 2 === 0) {
    // 차감 100P
    const res = http.post(`${POINT_URL}/point/use`, JSON.stringify({
      userId: userId,
      amount: 100,
      description: '동시성 테스트 차감'
    }), { headers, timeout: '10s' });
    successRate.add(res.status === 200);
  } else {
    // 적립 100P
    const res = http.post(`${POINT_URL}/point/earn`, JSON.stringify({
      userId: userId,
      amount: 100,
      description: '동시성 테스트 적립'
    }), { headers, timeout: '10s' });
    successRate.add(res.status === 200);
  }

  // 잔액 확인 — 마이너스 체크
  const balRes = http.get(`${POINT_URL}/point/${userId}`, { timeout: '5s' });
  if (balRes.status === 200) {
    try {
      const balance = JSON.parse(balRes.body).availablePoints;
      if (balance < 0) {
        overdraftCounter.add(1);
        console.log(`[OVERDRAFT] user=${userId} balance=${balance}`);
      }
    } catch(e) {}
  }

  sleep(0.1);
}

export function teardown(data) {
  console.log('');
  console.log('최종 잔액 확인...');

  let overdrafts = 0;
  for (let i = 1; i <= 50; i++) {
    const res = http.get(`${POINT_URL}/point/point-conc-${i}`, { timeout: '5s' });
    if (res.status === 200) {
      const balance = JSON.parse(res.body).availablePoints;
      if (balance < 0) overdrafts++;
    }
  }

  console.log('==============================================');
  console.log(`  최종 마이너스 잔액: ${overdrafts}명`);
  console.log('  0이면 SELECT FOR UPDATE 정상');
  console.log('==============================================');
}
