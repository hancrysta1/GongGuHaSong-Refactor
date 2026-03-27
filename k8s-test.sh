#!/bin/bash
echo "=== K8s 분배 테스트: 결제 20건 ==="
for i in $(seq 1 20); do
  curl -s -o /dev/null -w "$i " \
    -X POST http://localhost:8085/payment \
    -H "Content-Type: application/json" \
    -d "{\"orderId\":\"v3-$i\",\"userId\":\"k8s-v3\",\"title\":\"test\",\"quantity\":1,\"unitPrice\":100,\"pointUsed\":100,\"paymentMethod\":\"POINT\"}"
done
echo ""
echo "=== 잔액 ==="
curl -s http://localhost:8084/point/k8s-v3
echo ""
