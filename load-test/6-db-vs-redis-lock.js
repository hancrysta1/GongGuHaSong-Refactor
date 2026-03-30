import http from 'k6/http';
import { sleep, check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ══════════════════════════════════════════════════════════
//  DB 비관적 락 vs Redis 분산 락 — K6 부하 비교 테스트
//
//  동일 조건(VU, duration)으로 두 엔드포인트를 순차 실행
//  POST /point/use          → DB PESSIMISTIC_WRITE
//  POST /point-benchmark/use-redis → Redis 분산 락 (Redisson)
//
//  측정: TPS, 지연시간(p50/p95/p99), 성공률, 데이터 정합성
// ══════════════════════════════════════════════════════════

// ── 커스텀 메트릭 ──
const dbLatency = new Trend('db_lock_latency', true);
const redisLatency = new Trend('redis_lock_latency', true);
const dbSuccess = new Rate('db_lock_success');
const redisSuccess = new Rate('redis_lock_success');
const dbOverdraft = new Counter('db_overdraft');
const redisOverdraft = new Counter('redis_overdraft');

const POINT_URL = 'http://localhost:8084';
const HEADERS = { 'Content-Type': 'application/json' };
const USERS_PER_GROUP = 30;
const INITIAL_POINTS = 1000000;

// ── 시나리오 구성 ──
// Phase 1: DB 비관적 락 부하 (2분)
// Phase 2: 쿨다운 (30초)
// Phase 3: Redis 분산 락 부하 (2분)
export const options = {
  scenarios: {
    // ── Phase 1: DB 비관적 락 ──
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
    // ── Phase 2: 쿨다운 ──
    cooldown: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
      startTime: '2m',
      exec: 'cooldown',
    },
    // ── Phase 3: Redis 분산 락 ──
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

// ── Setup: 테스트 유저 초기화 ──
export function setup() {
  console.log('══════════════════════════════════════════════');
  console.log('  DB 비관적 락 vs Redis 분산 락 비교 테스트');
  console.log(`  유저 수: ${USERS_PER_GROUP}명 × 2그룹`);
  console.log(`  초기 포인트: ${INITIAL_POINTS.toLocaleString()}P`);
  console.log('  Phase 1: DB 비관적 락 (2분, 50→300 VU)');
  console.log('  Phase 2: 쿨다운 (30초)');
  console.log('  Phase 3: Redis 분산 락 (2분, 50→300 VU)');
  console.log('══════════════════════════════════════════════');

  // DB 락 테스트용 유저
  for (let i = 1; i <= USERS_PER_GROUP; i++) {
    http.post(`${POINT_URL}/point/earn`, JSON.stringify({
      userId: `bench-db-${i}`,
      amount: INITIAL_POINTS,
      description: '벤치마크 초기 충전 (DB)'
    }), { headers: HEADERS, timeout: '10s' });
  }

  // Redis 락 테스트용 유저
  for (let i = 1; i <= USERS_PER_GROUP; i++) {
    http.post(`${POINT_URL}/point/earn`, JSON.stringify({
      userId: `bench-redis-${i}`,
      amount: INITIAL_POINTS,
      description: '벤치마크 초기 충전 (Redis)'
    }), { headers: HEADERS, timeout: '10s' });
  }

  console.log(`${USERS_PER_GROUP * 2}명 초기화 완료`);

  // 초기 잔액 스냅샷
  const snapshot = {};
  for (let i = 1; i <= USERS_PER_GROUP; i++) {
    snapshot[`bench-db-${i}`] = getBalance(`bench-db-${i}`);
    snapshot[`bench-redis-${i}`] = getBalance(`bench-redis-${i}`);
  }

  return { snapshot };
}

// ── Phase 1: DB 비관적 락 테스트 ──
export function dbLockTest() {
  const userNum = ((__VU - 1) % USERS_PER_GROUP) + 1;
  const userId = `bench-db-${userNum}`;

  const start = Date.now();
  const res = http.post(`${POINT_URL}/point/use`, JSON.stringify({
    userId: userId,
    amount: 10,
    description: 'DB 락 벤치마크'
  }), { headers: HEADERS, timeout: '30s' });
  const elapsed = Date.now() - start;

  dbLatency.add(elapsed);
  const ok = res.status === 200;
  dbSuccess.add(ok);

  // 마이너스 잔액 체크
  if (ok) {
    const balRes = http.get(`${POINT_URL}/point/${userId}`, { timeout: '5s' });
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

// ── Phase 2: 쿨다운 ──
export function cooldown() {
  sleep(1);
}

// ── Phase 3: Redis 분산 락 테스트 ──
export function redisLockTest() {
  const userNum = ((__VU - 1) % USERS_PER_GROUP) + 1;
  const userId = `bench-redis-${userNum}`;

  const start = Date.now();
  const res = http.post(`${POINT_URL}/point-benchmark/use-redis`, JSON.stringify({
    userId: userId,
    amount: 10,
    description: 'Redis 락 벤치마크'
  }), { headers: HEADERS, timeout: '30s' });
  const elapsed = Date.now() - start;

  redisLatency.add(elapsed);
  const ok = res.status === 200;
  redisSuccess.add(ok);

  // 처음 5건만 에러 로깅 (디버그용)
  if (!ok && __ITER < 5) {
    console.log(`[REDIS ERROR] status=${res.status} body=${res.body}`);
  }

  // 마이너스 잔액 체크
  if (ok) {
    const balRes = http.get(`${POINT_URL}/point/${userId}`, { timeout: '5s' });
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

// ── Teardown: 최종 정합성 검증 ──
export function teardown(data) {
  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log('  최종 정합성 검증');
  console.log('══════════════════════════════════════════════');

  let dbOverdrafts = 0;
  let redisOverdrafts = 0;
  let dbTotalDeducted = 0;
  let redisTotalDeducted = 0;

  for (let i = 1; i <= USERS_PER_GROUP; i++) {
    const dbBal = getBalance(`bench-db-${i}`);
    const redisBal = getBalance(`bench-redis-${i}`);

    if (dbBal < 0) dbOverdrafts++;
    if (redisBal < 0) redisOverdrafts++;

    const dbInitial = data.snapshot[`bench-db-${i}`] || INITIAL_POINTS;
    const redisInitial = data.snapshot[`bench-redis-${i}`] || INITIAL_POINTS;
    dbTotalDeducted += (dbInitial - dbBal);
    redisTotalDeducted += (redisInitial - redisBal);
  }

  console.log(`  [DB 비관적 락]    마이너스 잔액: ${dbOverdrafts}명, 총 차감: ${dbTotalDeducted.toLocaleString()}P`);
  console.log(`  [Redis 분산 락]   마이너스 잔액: ${redisOverdrafts}명, 총 차감: ${redisTotalDeducted.toLocaleString()}P`);
  console.log('');
  console.log('  ※ K6 summary의 커스텀 메트릭 비교:');
  console.log('    db_lock_latency    vs  redis_lock_latency   (p50/p95/p99)');
  console.log('    db_lock_success    vs  redis_lock_success   (성공률)');
  console.log('    http_reqs (tag: lock_type=db/redis)         (TPS)');
  console.log('══════════════════════════════════════════════');
}

function getBalance(userId) {
  const res = http.get(`${POINT_URL}/point/${userId}`, { timeout: '5s' });
  if (res.status === 200) {
    try { return JSON.parse(res.body).availablePoints; } catch (e) {}
  }
  return 0;
}