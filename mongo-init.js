// MongoDB 초기화 스크립트
// Docker Compose에서 /docker-entrypoint-initdb.d/에 마운트하면 최초 기동 시 자동 실행

// member-service 전용 계정
db = db.getSiblingDB('member-db');
db.createUser({
  user: 'member_user',
  pwd: 'member-secret-2026',
  roles: [{ role: 'readWrite', db: 'member-db' }]
});

// product-service 전용 계정
db = db.getSiblingDB('product-db');
db.createUser({
  user: 'product_user',
  pwd: 'product-secret-2026',
  roles: [{ role: 'readWrite', db: 'product-db' }]
});

// order-service 전용 계정
db = db.getSiblingDB('order-db');
db.createUser({
  user: 'order_user',
  pwd: 'order-secret-2026',
  roles: [{ role: 'readWrite', db: 'order-db' }]
});

// search-service 전용 계정
db = db.getSiblingDB('search-db');
db.createUser({
  user: 'search_user',
  pwd: 'search-secret-2026',
  roles: [{ role: 'readWrite', db: 'search-db' }]
});
