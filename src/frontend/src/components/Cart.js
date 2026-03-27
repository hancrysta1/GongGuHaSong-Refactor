import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import styles from '../css/Cart.module.css';

function Cart() {
    const navigate = useNavigate();
    const [cartItems, setCartItems] = useState([]);
    const [showPayment, setShowPayment] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('POINT');
    const [loading, setLoading] = useState(false);
    const [userPoints, setUserPoints] = useState(0);
    const [userCards, setUserCards] = useState([]);
    const [selectedCardId, setSelectedCardId] = useState(null);

    useEffect(() => {
        loadCart();
        loadUserPoints();
        loadUserCards();
    }, []);

    const loadCart = () => {
        const cart = JSON.parse(sessionStorage.getItem('cart') || '[]');
        setCartItems(cart);
    };

    const loadUserPoints = async () => {
        const userId = sessionStorage.getItem('user_id');
        if (!userId) return;
        try {
            const res = await axios.get(`/point/${userId}`);
            setUserPoints(res.data.availablePoints || 0);
        } catch (e) {
            setUserPoints(0);
        }
    };

    const loadUserCards = async () => {
        const userId = sessionStorage.getItem('user_id');
        if (!userId) return;
        try {
            const res = await axios.get(`/payment/card/${userId}`);
            setUserCards(res.data || []);
            if (res.data.length > 0) {
                const defaultCard = res.data.find(c => c.default) || res.data[0];
                setSelectedCardId(defaultCard.id);
            }
        } catch (e) {
            setUserCards([]);
        }
    };

    const saveCart = (items) => {
        sessionStorage.setItem('cart', JSON.stringify(items));
        setCartItems(items);
    };

    const updateQuantity = (index, delta) => {
        const updated = [...cartItems];
        updated[index].quantity = Math.max(1, updated[index].quantity + delta);
        saveCart(updated);
    };

    const removeItem = (index) => {
        const updated = cartItems.filter((_, i) => i !== index);
        saveCart(updated);
    };

    const totalPrice = cartItems.reduce((sum, item) => {
        return sum + (item.price * item.quantity);
    }, 0);

    const handleCheckout = () => {
        if (cartItems.length === 0) {
            alert('장바구니가 비어있습니다.');
            return;
        }
        if (!sessionStorage.getItem('user_id')) {
            alert('로그인이 필요합니다.');
            navigate('/login');
            return;
        }
        setShowPayment(true);
    };

    const handlePay = async () => {
        const userId = sessionStorage.getItem('user_id');
        setLoading(true);

        try {
            for (const item of cartItems) {
                // ── STEP 1: 주문 생성 (재고 차감 + Kafka 이벤트 발행) ──
                const orderRes = await axios.post('/order', {
                    userId: userId,
                    total_Count: item.quantity,
                    method: '현장배부',
                    address: '',
                }, { params: { title: item.title } });

                const orderId = orderRes.data?._id || `cart-${userId}-${Date.now()}`;

                // ── STEP 2: 결제 처리 (포인트/카드) ──
                const pointUsed = paymentMethod === 'POINT' ? (item.price * item.quantity) : 0;

                await axios.post('/payment', {
                    orderId: orderId,
                    userId: userId,
                    title: item.title,
                    quantity: item.quantity,
                    unitPrice: item.price,
                    pointUsed: pointUsed,
                    paymentMethod: paymentMethod,
                    cardId: paymentMethod === 'CARD' ? selectedCardId : null
                });
            }

            alert('결제가 완료되었습니다!');
            sessionStorage.removeItem('cart');
            setCartItems([]);
            setShowPayment(false);
            navigate('/');
        } catch (error) {
            const msg = error.response?.data?.message || error.response?.data?.error || '결제에 실패했습니다.';
            alert(typeof msg === 'string' ? msg : '결제에 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.cart}>
            <div className={styles.cartTab}>
                <div className={styles.cartTitle}>장바구니</div>
                <div className={styles.line}></div>
            </div>

            {cartItems.length === 0 ? (
                <div className={styles.cartEmpty}>
                    장바구니가 비어있습니다.
                </div>
            ) : (
                <>
                    <div className={styles.cartList}>
                        {cartItems.map((item, index) => (
                            <div key={index} className={styles.cartItem}>
                                <img
                                    src={item.mainPhoto}
                                    alt={item.title}
                                    className={styles.cartItemImage}
                                />
                                <div className={styles.cartItemInfo}>
                                    <div className={styles.cartItemTitle}>{item.title}</div>
                                    <div className={styles.cartItemPrice}>
                                        {Number(item.price).toLocaleString()}원
                                    </div>
                                    <div className={styles.quantityControl}>
                                        <button
                                            className={styles.quantityBtn}
                                            onClick={() => updateQuantity(index, -1)}
                                        >
                                            -
                                        </button>
                                        <span className={styles.quantityValue}>{item.quantity}</span>
                                        <button
                                            className={styles.quantityBtn}
                                            onClick={() => updateQuantity(index, 1)}
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                                <div className={styles.cartItemRight}>
                                    <div className={styles.subtotal}>
                                        {(item.price * item.quantity).toLocaleString()}원
                                    </div>
                                    <button
                                        className={styles.removeBtn}
                                        onClick={() => removeItem(index)}
                                    >
                                        삭제
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {!showPayment ? (
                        <div className={styles.cartSummary}>
                            <div>
                                <span className={styles.totalLabel}>합계</span>
                            </div>
                            <div>
                                <span className={styles.totalPrice}>
                                    {totalPrice.toLocaleString()}원
                                </span>
                                <button
                                    className={styles.checkoutBtn}
                                    onClick={handleCheckout}
                                >
                                    전체 결제하기
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={{
                            margin: '20px auto', maxWidth: '500px', padding: '30px',
                            background: '#fff', borderRadius: '15px',
                            boxShadow: '0 2px 10px rgba(0,0,0,0.1)', fontFamily: 'content'
                        }}>
                            <h3 style={{ color: '#0D2D84', marginBottom: '20px' }}>결제 방법 선택</h3>

                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', border: paymentMethod === 'POINT' ? '2px solid #0D2D84' : '1px solid #ddd', borderRadius: '10px', cursor: 'pointer', marginBottom: '10px' }}>
                                    <input type="radio" name="pay" value="POINT"
                                        checked={paymentMethod === 'POINT'}
                                        onChange={() => setPaymentMethod('POINT')} />
                                    <div>
                                        <div style={{ fontWeight: 'bold' }}>포인트 결제</div>
                                        <div style={{ fontSize: '13px', color: '#888' }}>
                                            보유 포인트: {userPoints.toLocaleString()}P
                                            {userPoints < totalPrice && <span style={{ color: '#E53935' }}> (부족)</span>}
                                        </div>
                                    </div>
                                </label>

                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', border: paymentMethod === 'CARD' ? '2px solid #0D2D84' : '1px solid #ddd', borderRadius: '10px', cursor: 'pointer' }}>
                                    <input type="radio" name="pay" value="CARD"
                                        checked={paymentMethod === 'CARD'}
                                        onChange={() => setPaymentMethod('CARD')} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 'bold' }}>카드 결제</div>
                                        {userCards.length > 0 ? (
                                            <select value={selectedCardId || ''} onChange={(e) => setSelectedCardId(e.target.value)}
                                                style={{ marginTop: '6px', padding: '6px 10px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '13px', fontFamily: 'content' }}
                                                onClick={(e) => e.stopPropagation()}>
                                                {userCards.map(card => (
                                                    <option key={card.id} value={card.id}>
                                                        {card.cardCompany} {card.maskedCardNumber} (잔여 {(card.availableAmount || 0).toLocaleString()}원)
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <div style={{ fontSize: '13px', color: '#E53935', marginTop: '4px' }}>등록된 카드가 없습니다</div>
                                        )}
                                    </div>
                                </label>
                            </div>

                            <div style={{ borderTop: '1px solid #eee', paddingTop: '15px', marginBottom: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '20px', fontWeight: 'bold' }}>
                                    <span>총 결제금액</span>
                                    <span style={{ color: '#0D2D84' }}>{totalPrice.toLocaleString()}원</span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={() => setShowPayment(false)} style={{
                                    flex: 1, padding: '14px', border: '1px solid #ccc', borderRadius: '10px',
                                    background: '#fff', fontSize: '16px', cursor: 'pointer', fontFamily: 'content'
                                }}>취소</button>
                                <button onClick={handlePay} disabled={loading || (paymentMethod === 'POINT' && userPoints < totalPrice) || (paymentMethod === 'CARD' && !selectedCardId)} style={{
                                    flex: 2, padding: '14px', border: 'none', borderRadius: '10px',
                                    background: (loading || (paymentMethod === 'POINT' && userPoints < totalPrice) || (paymentMethod === 'CARD' && !selectedCardId)) ? '#ccc' : '#0D2D84',
                                    color: '#fff', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'content'
                                }}>{loading ? '결제 중...' : '결제하기'}</button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default Cart;
