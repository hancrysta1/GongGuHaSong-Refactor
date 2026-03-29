import http from 'k6/http';
import { sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

// ── 재고 동시성 Before ──
// 재고 100개 상품에 300명이 동시 주문
// 검증: 100명만 성공해야 하는데, 초과 판매가 발생하는가?

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
  console.log('  재고 동시성 테스트');
  console.log('  재고 100개 상품에 300명이 동시 주문');
  console.log('  성공 > 100이면 초과 판매 (race condition)');
  console.log('==============================================');

  // 테스트 상품 생성 (재고 100개)
  const createRes = http.post(`${PRODUCT_URL}/sell`, JSON.stringify({
    title: '재고테스트 한정판',
    managerId: 'stock-test',
    price: 10000,
    min_count: 10,
    stock: 100,
    info: '재고 동시성 테스트용',
    category: '테스트',
  }), { headers, timeout: '10s' });

  if (createRes.status === 200 || createRes.status === 201) {
    const product = JSON.parse(createRes.body);
    console.log(`상품 생성: id=${product._id}, stock=100`);
    return { productTitle: '재고테스트 한정판' };
  } else {
    // 이미 존재하면 재고 리셋
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
        console.log(`상품 재고 리셋: id=${id}, stock=100`);
      }
    }
    return { productTitle: '재고테스트 한정판' };
  }
}

export default function (data) {
  const headers = { 'Content-Type': 'application/json' };
  const userId = `stock-buyer-${__VU}`;

  // 주문 요청 (1인 1개)
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
  // 최종 재고 확인
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
  console.log('  재고 < 0 이면 → 초과 판매 발생 (race condition)');
  console.log('  성공 > 100 이면 → 재고 체크 우회됨');
  console.log('==============================================');
}
