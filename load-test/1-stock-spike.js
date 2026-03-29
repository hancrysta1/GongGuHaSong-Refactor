import http from 'k6/http';
import { Counter, Rate } from 'k6/metrics';

// ── 재고 동시성 스파이크 테스트 ──
// 재고 100개에 3000명이 한 번에 몰리는 극한 시나리오
// 인기 공구 오픈 순간을 시뮬레이션

const successCounter = new Counter('order_success');
const failCounter = new Counter('order_fail');
const successRate = new Rate('success_rate');

const ORDER_URL = 'http://localhost:8083';
const PRODUCT_URL = 'http://localhost:8082';

export const options = {
  scenarios: {
    spike: {
      executor: 'shared-iterations',
      vus: 10000,
      iterations: 10000,
      maxDuration: '2m',
    },
  },
};

export function setup() {
  const headers = { 'Content-Type': 'application/json' };

  console.log('==============================================');
  console.log('  재고 스파이크 테스트');
  console.log('  재고 100개에 10000명이 동시 주문');
  console.log('  성공 = 100, 재고 = 0 이면 통과');
  console.log('==============================================');

  // 테스트 상품 재고 리셋
  const findRes = http.get(`${PRODUCT_URL}/sell?title=${encodeURIComponent('스파이크테스트 한정판')}`, { timeout: '10s' });
  if (findRes.status === 200) {
    const products = JSON.parse(findRes.body);
    if (products.length > 0) {
      const id = products[0]._id;
      http.put(`${PRODUCT_URL}/sell/${id}`, JSON.stringify({
        title: '스파이크테스트 한정판',
        managerId: 'spike-test',
        price: 10000,
        min_count: 10,
        stock: 100,
        info: '스파이크 테스트용',
        category: '테스트',
      }), { headers, timeout: '10s' });
      console.log(`상품 재고 리셋: stock=100`);
      return { productTitle: '스파이크테스트 한정판' };
    }
  }

  // 상품 없으면 새로 생성
  const createRes = http.post(`${PRODUCT_URL}/sell`, JSON.stringify({
    title: '스파이크테스트 한정판',
    managerId: 'spike-test',
    price: 10000,
    min_count: 10,
    stock: 100,
    info: '스파이크 테스트용',
    category: '테스트',
  }), { headers, timeout: '10s' });

  if (createRes.status === 200 || createRes.status === 201) {
    console.log(`상품 생성: stock=100`);
  }
  return { productTitle: '스파이크테스트 한정판' };
}

export default function (data) {
  const headers = { 'Content-Type': 'application/json' };
  const userId = `spike-buyer-${__VU}`;

  const res = http.post(
    `${ORDER_URL}/order?title=${encodeURIComponent(data.productTitle)}`,
    JSON.stringify({
      userId: userId,
      total_Count: 1,
      method: '현장배부',
      address: '',
    }),
    { headers, timeout: '30s' }
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
    { timeout: '10s' }
  );

  let finalStock = '?';
  if (findRes.status === 200) {
    const products = JSON.parse(findRes.body);
    if (products.length > 0) finalStock = products[0].stock;
  }

  console.log('');
  console.log('==============================================');
  console.log(`  10000명 동시 주문 결과`);
  console.log(`  최종 재고: ${finalStock}`);
  console.log('  성공 = 100, 재고 = 0 이면 findAndModify 정상');
  console.log('==============================================');
}
