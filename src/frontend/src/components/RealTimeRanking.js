import React, { useState, useEffect, useRef } from 'react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import axios from 'axios';
import styles from '../css/Search.module.css';

function RealTimeRanking() {
  const [rankings, setRankings] = useState([]);
  const [connected, setConnected] = useState(false);
  const clientRef = useRef(null);

  useEffect(() => {
    // 초기 랭킹 로드
    axios.get('/search/ranking')
      .then(res => { if (Array.isArray(res.data)) setRankings(res.data); })
      .catch(() => {});

    // WebSocket 연결
    const client = new Client({
      webSocketFactory: () => new SockJS('/ws/search'),
      reconnectDelay: 5000,
      onConnect: () => {
        setConnected(true);
        client.subscribe('/topic/rankings', (message) => {
          const data = JSON.parse(message.body);
          if (Array.isArray(data)) setRankings(data);
        });
      },
      onDisconnect: () => {
        setConnected(false);
      },
      onStompError: (frame) => {
        console.error('STOMP error:', frame);
      }
    });

    client.activate();
    clientRef.current = client;

    return () => {
      if (clientRef.current) {
        clientRef.current.deactivate();
      }
    };
  }, []);

  const getChangeIcon = (direction) => {
    switch (direction) {
      case 'UP': return '▲';
      case 'DOWN': return '▼';
      case 'NEW': return 'NEW';
      default: return '-';
    }
  };

  const getChangeColor = (direction) => {
    switch (direction) {
      case 'UP': return '#e74c3c';
      case 'DOWN': return '#3498db';
      case 'NEW': return '#e67e22';
      default: return '#95a5a6';
    }
  };

  return (
    <div className={styles.rankingContainer}>
      <div className={styles.rankingHeader}>
        <span className={styles.rankingTitle}>실시간 인기 검색어</span>
        <span className={styles.liveIndicator}>
          <span className={connected ? styles.liveDotActive : styles.liveDot}></span>
          {connected ? 'LIVE' : 'OFF'}
        </span>
      </div>
      <ul className={styles.rankingList}>
        {rankings.length > 0 ? rankings.map((item, idx) => (
          <li key={idx} className={styles.rankingItem}>
            <span className={styles.rankNumber}>{item.rank}</span>
            <span className={styles.rankKeyword}>{item.keyword}</span>
            <span className={styles.rankChange} style={{ color: getChangeColor(item.changeDirection) }}>
              {getChangeIcon(item.changeDirection)}
            </span>
          </li>
        )) : (
          <li className={styles.rankingEmpty}>검색 데이터가 없습니다</li>
        )}
      </ul>
    </div>
  );
}

export default RealTimeRanking;
