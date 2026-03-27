import React, { useState, useEffect, useRef } from 'react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

function OrderNotification({ title }) {
  const [notifications, setNotifications] = useState([]);
  const clientRef = useRef(null);

  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS('/ws/order'),
      reconnectDelay: 5000,
      onConnect: () => {
        // 특정 상품의 주문 이벤트 구독
        const destination = title ? `/topic/orders/${title}` : '/topic/orders';
        client.subscribe(destination, (message) => {
          const event = JSON.parse(message.body);
          setNotifications(prev => {
            const updated = [event, ...prev];
            return updated.slice(0, 10); // 최근 10개만 유지
          });

          // 5초 후 알림 자동 제거
          setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.orderId !== event.orderId));
          }, 5000);
        });
      }
    });

    client.activate();
    clientRef.current = client;

    return () => {
      if (clientRef.current) {
        clientRef.current.deactivate();
      }
    };
  }, [title]);

  if (notifications.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }}>
      {notifications.map((notif, idx) => (
        <div key={notif.orderId + idx} style={{
          background: '#0D2D84',
          color: 'white',
          padding: '12px 20px',
          borderRadius: '10px',
          fontFamily: 'content',
          fontSize: '14px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          animation: 'slideIn 0.3s ease-out'
        }}>
          <strong>{notif.title}</strong> - {notif.userId}님이 {notif.quantity}개 주문!
        </div>
      ))}
    </div>
  );
}

export default OrderNotification;
