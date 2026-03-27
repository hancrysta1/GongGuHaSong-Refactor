import React, { useState, useEffect } from 'react';
import styles from '../css/MyPage.module.css';
import axios from 'axios';

function MyPage() {
    const userId = sessionStorage.getItem('user_id');

    const [userInfo, setUserInfo] = useState(null);
    const [point, setPoint] = useState(null);
    const [cards, setCards] = useState([]);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCardForm, setShowCardForm] = useState(false);
    const [cardForm, setCardForm] = useState({
        cardNumber: '', cardCompany: '신한카드', holderName: '', expiryDate: ''
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            // 사용자 정보
            try {
                const memberRes = await axios.get('/member/' + userId);
                setUserInfo(memberRes.data);
            } catch (e) {
                setUserInfo({ userId: userId });
            }

            // 포인트 잔액
            try {
                const pointRes = await axios.get('/point/' + userId);
                setPoint(pointRes.data);
            } catch (e) {
                setPoint(null);
            }

            // 등록된 카드
            try {
                const cardRes = await axios.get('/payment/card/' + userId);
                if (Array.isArray(cardRes.data)) {
                    setCards(cardRes.data);
                }
            } catch (e) {
                setCards([]);
            }

            // 주문 내역
            try {
                const orderRes = await axios.get('/order/all');
                if (Array.isArray(orderRes.data)) {
                    const myOrders = orderRes.data.filter(
                        (order) => order.userId === userId
                    );
                    setOrders(myOrders);
                }
            } catch (e) {
                setOrders([]);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCardRegister = async (e) => {
        e.preventDefault();
        try {
            const res = await axios.post('/payment/card', {
                userId: userId,
                cardNumber: cardForm.cardNumber,
                cardCompany: cardForm.cardCompany,
                holderName: cardForm.holderName,
                expiryDate: cardForm.expiryDate
            });
            setCards([...cards, res.data]);
            setShowCardForm(false);
            setCardForm({ cardNumber: '', cardCompany: '신한카드', holderName: '', expiryDate: '' });
            alert('카드가 등록되었습니다.');
        } catch (e) {
            alert('카드 등록에 실패했습니다.');
        }
    };

    const handleDeleteCard = async (cardId) => {
        if (!window.confirm('카드를 삭제하시겠습니까?')) return;
        try {
            await axios.delete('/payment/card/' + cardId);
            setCards(cards.filter(c => c.id !== cardId));
        } catch (e) {
            alert('카드 삭제에 실패했습니다.');
        }
    };

    const maskCardNumber = (cardNumber) => {
        if (!cardNumber) return '****-****-****-****';
        const cleaned = cardNumber.replace(/\D/g, '');
        const last4 = cleaned.slice(-4);
        return '****-****-****-' + last4;
    };

    return (
        <div className={styles.mypage}>
            <div className={styles.mypageTab}>
                <div className={styles.mypageTitle}>마이페이지</div>
                <div className={styles.line}></div>
            </div>

            {/* 사용자 정보 */}
            <div className={styles.section}>
                <div className={styles.sectionTitle}>사용자 정보</div>
                {loading ? (
                    <div className={styles.loading}>로딩 중...</div>
                ) : (
                    <div className={styles.userInfo}>
                        <div className={styles.infoRow}>
                            <span className={styles.infoLabel}>아이디</span>
                            <span className={styles.infoValue}>
                                {userInfo?.userId || userId}
                            </span>
                        </div>
                        {userInfo?.userName && (
                            <div className={styles.infoRow}>
                                <span className={styles.infoLabel}>이름</span>
                                <span className={styles.infoValue}>
                                    {userInfo.userName}
                                </span>
                            </div>
                        )}
                        {userInfo?.email && (
                            <div className={styles.infoRow}>
                                <span className={styles.infoLabel}>이메일</span>
                                <span className={styles.infoValue}>
                                    {userInfo.email}
                                </span>
                            </div>
                        )}
                        {userInfo?.phoneNumber && (
                            <div className={styles.infoRow}>
                                <span className={styles.infoLabel}>연락처</span>
                                <span className={styles.infoValue}>
                                    {userInfo.phoneNumber}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 포인트 잔액 */}
            <div className={styles.section}>
                <div className={styles.sectionTitle}>포인트 잔액</div>
                {loading ? (
                    <div className={styles.loading}>로딩 중...</div>
                ) : (
                    <div className={styles.pointBalance}>
                        {point !== null && point !== undefined
                            ? (typeof point === 'object' ? (point.availablePoints || 0) : point).toLocaleString()
                            : 0}
                        <span className={styles.pointUnit}>P</span>
                    </div>
                )}
            </div>

            {/* 등록된 카드 */}
            <div className={styles.section}>
                <div className={styles.sectionTitle}>
                    등록된 카드
                    <button className={styles.addCardBtn} onClick={() => setShowCardForm(!showCardForm)}>
                        {showCardForm ? '취소' : '+ 카드 등록'}
                    </button>
                </div>
                {showCardForm && (
                    <form className={styles.cardForm} onSubmit={handleCardRegister}>
                        <input type="text" placeholder="카드번호 (숫자만)" value={cardForm.cardNumber}
                            onChange={e => setCardForm({...cardForm, cardNumber: e.target.value})} required />
                        <select value={cardForm.cardCompany}
                            onChange={e => setCardForm({...cardForm, cardCompany: e.target.value})}>
                            <option>신한카드</option>
                            <option>삼성카드</option>
                            <option>현대카드</option>
                            <option>KB국민카드</option>
                        </select>
                        <input type="text" placeholder="카드 소유자명" value={cardForm.holderName}
                            onChange={e => setCardForm({...cardForm, holderName: e.target.value})} required />
                        <input type="text" placeholder="유효기간 (MM/YY)" value={cardForm.expiryDate}
                            onChange={e => setCardForm({...cardForm, expiryDate: e.target.value})} required />
                        <button type="submit" className={styles.submitBtn}>등록</button>
                    </form>
                )}
                {loading ? (
                    <div className={styles.loading}>로딩 중...</div>
                ) : cards.length === 0 && !showCardForm ? (
                    <div className={styles.noData}>등록된 카드가 없습니다.</div>
                ) : (
                    <div className={styles.cardList}>
                        {cards.map((card, index) => (
                            <div key={index} className={styles.cardItem}>
                                <div className={styles.cardNumber}>
                                    {card.maskedCardNumber || maskCardNumber(card.cardNumber)}
                                </div>
                                <div className={styles.cardDetails}>
                                    <span className={styles.cardCompany}>
                                        {card.cardCompany || '카드사 정보 없음'}
                                        {card.cardType ? ' / ' + card.cardType : ''}
                                    </span>
                                    <span className={styles.cardLimit}>
                                        잔여 한도: {(card.availableAmount !== undefined ? card.availableAmount : card.availableLimit || 0).toLocaleString()}원
                                    </span>
                                </div>
                                <button className={styles.deleteBtn} onClick={() => handleDeleteCard(card.id)}>삭제</button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 최근 주문 내역 */}
            <div className={styles.section}>
                <div className={styles.sectionTitle}>최근 주문 내역</div>
                {loading ? (
                    <div className={styles.loading}>로딩 중...</div>
                ) : orders.length === 0 ? (
                    <div className={styles.noData}>주문 내역이 없습니다.</div>
                ) : (
                    <div className={styles.orderList}>
                        {orders.map((order, index) => (
                            <div key={index} className={styles.orderItem}>
                                <div className={styles.orderTitle}>
                                    {order.title || '주문 #' + (index + 1)}
                                </div>
                                <div className={styles.orderDetails}>
                                    <span className={styles.orderQuantity}>
                                        수량: {order.total_Count || order.quantity || '-'}개
                                    </span>
                                    {order.depositTime && (
                                        <span className={styles.orderDate}>
                                            {new Date(order.depositTime).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default MyPage;
