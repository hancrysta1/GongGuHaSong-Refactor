import http from 'k6/http';
import { sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

// ── 재고 동시성 After ──
// 1-stock-before.js와 동일 조건
// 원자적 재고 차감 적용 후 실행
// 검증: 성공 정확히 100건, 재고 정확히 0

const successCounter = new Counter('order_success');
const failCounter = new Counter('order_fail');
const successRate = new Rate('success_rate');

const ORDER_URL = 'http://localhost:8083';
const PRODUCT_URL = 'http://localhost:8082';

export const options = {
  scenarios: {
    rush: {
      executor: 'shared-iterations',
      vus: 300,
      iterations: 300,
      maxDuration: '1m',
    },
  },
};

export function setup() {
  const headers = { 'Content-Type': 'application/json' };

  console.log('==============================================');
  console.log('  재고 동시성 After: 원자적 재고 차감 적용');
  console.log('  재고 100개 상품에 300명이 동시 주문');
  console.log('  성공 정확히 100, 재고 정확히 0이면 통과');
  console.log('==============================================');

  // 테스트 상품 재고 리셋
  const findRes = http.get(`${PRODUCT_URL}/sell?title=${encodeURIComponent('재고테스트 한정판')}`, { timeout: '5s' });
  if (findRes.status === 200) {
    const products = JSON.parse(findRes.body);
    if (products.length > 0) {
      const id = products[0]._id;
      http.put(`${PRODUCT_URL}/sell/${id}`, JSON.stringify({
        title: '재고테스트 한정판',
        managerId: 'stock-test',
        price: 10000,
        min_count: 10,
        stock: 100,
        info: '재고 동시성 테스트용',
        category: '테스트',
      }), { headers, timeout: '5s' });
      console.log(`상품 재고 리셋: stock=100`);
    }
  }
  return { productTitle: '재고테스트 한정판' };
}

export default function (data) {
  const headers = { 'Content-Type': 'application/json' };
  const userId = `stock-buyer-${__VU}`;

  const res = http.post(
    `${ORDER_URL}/order?title=${encodeURIComponent(data.productTitle)}`,
    JSON.stringify({
      userId: userId,
      total_Count: 1,
      method: '현장배부',
      address: '',
    }),
    { headers, timeout: '10s' }
  );

  if (res.status === 200) {
    successCounter.add(1);
    successRate.add(true);
  } else {
    failCounter.add(1);
    successRate.add(false);
  }
}

export function teardown(data) {
  const findRes = http.get(
    `http://localhost:8082/sell?title=${encodeURIComponent(data.productTitle)}`,
    { timeout: '5s' }
  );

  let finalStock = '?';
  if (findRes.status === 200) {
    const products = JSON.parse(findRes.body);
    if (products.length > 0) finalStock = products[0].stock;
  }

  console.log('');
  console.log('==============================================');
  console.log(`  최종 재고: ${finalStock}`);
  console.log('  재고 = 0, 성공 = 100이면 원자적 차감 정상');
  console.log('==============================================');
}
