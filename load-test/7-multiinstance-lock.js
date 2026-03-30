import http from 'k6/http';
import { sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ══════════════════════════════════════════════════════════
//  멀티 인스턴스 환경: DB 비관적 락 vs Redis 분산 락
//
//  point-service 3대 + nginx 로드밸런서 (8090)
//  동일 유저에 대한 요청이 서로 다른 인스턴스로 분산됨
//
//  DB 비관적 락: 각 인스턴스가 별도 DB 커넥션 풀 → 커넥션 경합 심화
//  Redis 분산 락: 인스턴스 수와 무관하게 Redis에서 중앙 관리
// ══════════════════════════════════════════════════════════

const dbLatency = new Trend('db_lock_latency', true);
const redisLatency = new Trend('redis_lock_latency', true);
const dbSuccess = new Rate('db_lock_success');
const redisSuccess = new Rate('redis_lock_success');
const dbOverdraft = new Counter('db_overdraft');
const redisOverdraft = new Counter('redis_overdraft');
const dbErrors = new Counter('db_lock_errors');
const redisErrors = new Counter('redis_lock_errors');

// 로드밸런서 주소 (nginx → 3개 인스턴스)
const LB_URL = 'http://localhost:8090';
const HEADERS = { 'Content-Type': 'application/json' };
const USERS_PER_GROUP = 30;
const INITIAL_POINTS = 1000000;

export const options = {
  scenarios: {
    db_lock_rampup: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 50 },
        { duration: '30s', target: 100 },
        { duration: '30s', target: 200 },
        { duration: '30s', target: 300 },
        { duration: '15s', target: 0 },
      ],
      exec: 'dbLockTest',
      tags: { lock_type: 'db' },
    },
    cooldown: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
      startTime: '2m',
      exec: 'cooldown',
    },
    redis_lock_rampup: {
      executor: 'ramping-vus',
      startVUs: 0,
      startTime: '2m30s',
      stages: [
        { duration: '15s', target: 50 },
        { duration: '30s', target: 100 },
        { duration: '30s', target: 200 },
        { duration: '30s', target: 300 },
        { duration: '15s', target: 0 },
      ],
      exec: 'redisLockTest',
      tags: { lock_type: 'redis' },
    },
  },
  thresholds: {
    'db_overdraft': ['count<1'],
    'redis_overdraft': ['count<1'],
  },
};

export function setup() {
  console.log('══════════════════════════════════════════════');
  console.log('  [멀티 인스턴스] DB 비관적 락 vs Redis 분산 락');
  console.log(`  인스턴스: 6대 (nginx 로드밸런서)`);
  console.log(`  유저 수: ${USERS_PER_GROUP}명 × 2그룹`);
  console.log(`  초기 포인트: ${INITIAL_POINTS.toLocaleString()}P`);
  console.log('  Phase 1: DB 비관적 락 (2분, 50→300 VU)');
  console.log('  Phase 2: 쿨다운 (30초)');
  console.log('  Phase 3: Redis 분산 락 (2분, 50→300 VU)');
  console.log('══════════════════════════════════════════════');

  // DB 락 테스트용 유저 초기화
  for (let i = 1; i <= USERS_PER_GROUP; i++) {
    http.post(`${LB_URL}/point/earn`, JSON.stringify({
      userId: `multi-db-${i}`,
      amount: INITIAL_POINTS,
      description: '멀티인스턴스 벤치마크 초기 충전 (DB)'
    }), { headers: HEADERS, timeout: '10s' });
  }

  // Redis 락 테스트용 유저 초기화
  for (let i = 1; i <= USERS_PER_GROUP; i++) {
    http.post(`${LB_URL}/point/earn`, JSON.stringify({
      userId: `multi-redis-${i}`,
      amount: INITIAL_POINTS,
      description: '멀티인스턴스 벤치마크 초기 충전 (Redis)'
    }), { headers: HEADERS, timeout: '10s' });
  }

  console.log(`${USERS_PER_GROUP * 2}명 초기화 완료`);

  const snapshot = {};
  for (let i = 1; i <= USERS_PER_GROUP; i++) {
    snapshot[`multi-db-${i}`] = getBalance(`multi-db-${i}`);
    snapshot[`multi-redis-${i}`] = getBalance(`multi-redis-${i}`);
  }

  return { snapshot };
}

// ── Phase 1: DB 비관적 락 ──
export function dbLockTest() {
  const userNum = ((__VU - 1) % USERS_PER_GROUP) + 1;
  const userId = `multi-db-${userNum}`;

  const start = Date.now();
  const res = http.post(`${LB_URL}/point/use`, JSON.stringify({
    userId: userId,
    amount: 10,
    description: 'DB 락 멀티인스턴스 벤치마크'
  }), { headers: HEADERS, timeout: '30s' });
  const elapsed = Date.now() - start;

  dbLatency.add(elapsed);
  const ok = res.status === 200;
  dbSuccess.add(ok);

  if (!ok) {
    dbErrors.add(1);
    if (__ITER < 3) {
      console.log(`[DB ERROR] status=${res.status} body=${res.body}`);
    }
  }

  if (ok) {
    const balRes = http.get(`${LB_URL}/point/${userId}`, { timeout: '5s' });
    if (balRes.status === 200) {
      try {
        const balance = JSON.parse(balRes.body).availablePoints;
        if (balance < 0) {
          dbOverdraft.add(1);
          console.log(`[DB OVERDRAFT] user=${userId} balance=${balance}`);
        }
      } catch (e) {}
    }
  }

  sleep(0.05);
}

export function cooldown() {
  sleep(1);
}

// ── Phase 3: Redis 분산 락 ──
export function redisLockTest() {
  const userNum = ((__VU - 1) % USERS_PER_GROUP) + 1;
  const userId = `multi-redis-${userNum}`;

  const start = Date.now();
  const res = http.post(`${LB_URL}/point-benchmark/use-redis`, JSON.stringify({
    userId: userId,
    amount: 10,
    description: 'Redis 락 멀티인스턴스 벤치마크'
  }), { headers: HEADERS, timeout: '30s' });
  const elapsed = Date.now() - start;

  redisLatency.add(elapsed);
  const ok = res.status === 200;
  redisSuccess.add(ok);

  if (!ok) {
    redisErrors.add(1);
    if (__ITER < 3) {
      console.log(`[REDIS ERROR] status=${res.status} body=${res.body}`);
    }
  }

  if (ok) {
    const balRes = http.get(`${LB_URL}/point/${userId}`, { timeout: '5s' });
    if (balRes.status === 200) {
      try {
        const balance = JSON.parse(balRes.body).availablePoints;
        if (balance < 0) {
          redisOverdraft.add(1);
          console.log(`[REDIS OVERDRAFT] user=${userId} balance=${balance}`);
        }
      } catch (e) {}
    }
  }

  sleep(0.05);
}

export function teardown(data) {
  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log('  [멀티 인스턴스] 최종 정합성 검증');
  console.log('══════════════════════════════════════════════');

  let dbOverdrafts = 0;
  let redisOverdrafts = 0;
  let dbTotalDeducted = 0;
  let redisTotalDeducted = 0;

  for (let i = 1; i <= USERS_PER_GROUP; i++) {
    const dbBal = getBalance(`multi-db-${i}`);
    const redisBal = getBalance(`multi-redis-${i}`);

    if (dbBal < 0) dbOverdrafts++;
    if (redisBal < 0) redisOverdrafts++;

    const dbInitial = data.snapshot[`multi-db-${i}`] || INITIAL_POINTS;
    const redisInitial = data.snapshot[`multi-redis-${i}`] || INITIAL_POINTS;
    dbTotalDeducted += (dbInitial - dbBal);
    redisTotalDeducted += (redisInitial - redisBal);
  }

  console.log(`  [DB 비관적 락]    마이너스 잔액: ${dbOverdrafts}명, 총 차감: ${dbTotalDeducted.toLocaleString()}P`);
  console.log(`  [Redis 분산 락]   마이너스 잔액: ${redisOverdrafts}명, 총 차감: ${redisTotalDeducted.toLocaleString()}P`);
  console.log('');
  console.log('  ※ 단일 인스턴스 결과와 비교해보세요!');
  console.log('    - DB 락: 커넥션 풀 경합으로 에러율/지연 증가 예상');
  console.log('    - Redis 락: 인스턴스 수 무관하게 안정적 성능 예상');
  console.log('══════════════════════════════════════════════');
}

function getBalance(userId) {
  const res = http.get(`${LB_URL}/point/${userId}`, { timeout: '5s' });
  if (res.status === 200) {
    try { return JSON.parse(res.body).availablePoints; } catch (e) {}
  }
  return 0;
}