-- 서비스별 DB 생성
CREATE DATABASE IF NOT EXISTS point_db;
CREATE DATABASE IF NOT EXISTS payment_db;

-- point-service 전용 계정 (point_db만 접근 가능)
CREATE USER IF NOT EXISTS 'point_user'@'%' IDENTIFIED BY 'point-secret-2026';
GRANT ALL PRIVILEGES ON point_db.* TO 'point_user'@'%';

-- payment-service 전용 계정 (payment_db만 접근 가능)
CREATE USER IF NOT EXISTS 'payment_user'@'%' IDENTIFIED BY 'payment-secret-2026';
GRANT ALL PRIVILEGES ON payment_db.* TO 'payment_user'@'%';

FLUSH PRIVILEGES;
