import React, { useEffect } from 'react';
import styles from '../css/Gongguapply.module.css';
import { useState } from "react";
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function Gongguapply({ findItem }) {
    const history = useNavigate();
    const [quantity, setQuantity] = useState(1);
    const [method, setMethod] = useState('');
    const [address, setAddress] = useState('');

    const maxQuantity = findItem.stock || 99;

    const handleSubmit = async(e) => {
        e.preventDefault();
        await axios({
            method: "POST",
            url: '/order',
            data: {
                userId: sessionStorage.user_id,
                total_Count: quantity,
                method: method,
                address: address,
            },
            params: {title: findItem.title}
          }).then((res) => {
            if (res.status === 200) {
                alert("구매가 완료되었습니다!");
              window.location.href = `/product/${findItem._id}`;
            }
          }).catch((error) => {
            if (error.response) {
                const errorMessage = error.response.data.message || error.response.data.error || error.response.data;
                if (error.response.status === 404) {
                    alert(typeof errorMessage === 'string' ? errorMessage : "해당 상품을 찾을 수 없습니다.");
                } else if (error.response.status === 400) {
                    alert(typeof errorMessage === 'string' ? errorMessage : "재고가 부족합니다.");
                } else {
                    alert("구매에 실패했습니다: " + (typeof errorMessage === 'string' ? errorMessage : error.message));
                }
            } else {
                alert("서버와 연결할 수 없습니다.");
            }
          });
    }

    return (
        <div className={styles.gongguapply}>
            <div className={styles.gongguapplytab}>
                <div className={styles.formname}>구매 신청</div>
                <div className={styles.line}></div>
            </div>

            <div className={styles.gongguinfo}>
                <p>{findItem.title}</p>
                <img src={findItem.mainPhoto} alt="상품사진" style={{ width: "250px", height: "250px", objectFit: 'cover', borderRadius: '10px' }} />
                <p>가격 <b>{Number(findItem.price).toLocaleString()}원</b></p>
                <p style={{ fontSize: '14px', color: '#666', marginTop: '5px' }}>
                    최소수량 <b style={{ color: '#0D2D84' }}>{findItem.min_count}개</b> &nbsp;|&nbsp;
                    재고 <b>{findItem.stock || 0}개</b>
                </p>
            </div>

            <div className={styles.form}>
                <ul className={styles.applyform}>
                    <form onSubmit={handleSubmit}>

                        <li style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                            <label>구매수량</label>
                            <div style={{ display: 'flex', alignItems: 'center', border: '2px solid #0D2D84', borderRadius: '8px', overflow: 'hidden' }}>
                                <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                    style={{ width: '40px', height: '40px', border: 'none', background: '#f0f0f0', fontSize: '20px', cursor: 'pointer' }}>−</button>
                                <input type="number" min="1" max={maxQuantity} value={quantity}
                                    onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) setQuantity(Math.max(1, Math.min(maxQuantity, v))); }}
                                    style={{ width: '50px', textAlign: 'center', fontSize: '18px', fontWeight: 'bold', fontFamily: 'content', border: 'none', outline: 'none', MozAppearance: 'textfield' }} />
                                <button type="button" onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))}
                                    style={{ width: '40px', height: '40px', border: 'none', background: '#f0f0f0', fontSize: '20px', cursor: 'pointer' }}>+</button>
                            </div>
                            <span style={{ fontSize: '14px', color: '#999' }}>최대 {maxQuantity}개</span>
                        </li>

                        <li style={{ marginBottom: '15px' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '18px', color: '#0D2D84', marginBottom: '10px' }}>
                                총 결제금액: {(findItem.price * quantity).toLocaleString()}원
                            </div>
                        </li>

                        <li style={{ marginBottom: '10px' }}><label>배부방식</label></li>
                        <li style={{ marginBottom: '5px' }}>
                            <input type="radio" name="method" id="off" value="현장배부" onChange={(e) => setMethod(e.target.value)}/>
                            <label htmlFor="off"> 오프라인 현장 배부</label>
                        </li>
                        <li style={{ marginBottom: '10px' }}>
                            <input type="radio" name="method" id="deliver" value="택배" onChange={(e) => setMethod(e.target.value)}/>
                            <label htmlFor="deliver"> 택배</label>
                        </li>

                        {method === '택배' && (
                            <li style={{ marginBottom: '15px' }}>
                                <label>주소&nbsp;&nbsp;</label>
                                <input type="text" value={address} placeholder="배송 주소를 입력해주세요"
                                    style={{ width: '400px', padding: '8px', borderRadius: '5px', border: '1px solid #ccc' }}
                                    onChange={(e) => setAddress(e.target.value)}/>
                            </li>
                        )}

                        <div className={styles.buttongroup}>
                            <button className={styles.submit} type="submit">결제하기</button>&nbsp;
                            <button type="button" className={styles.submit} style={{ backgroundColor: '#F48B29', left: '-20px' }} onClick={() => {
                                const cart = JSON.parse(sessionStorage.getItem('cart') || '[]');
                                const existingIndex = cart.findIndex(item => item.title === findItem.title);
                                if (existingIndex >= 0) {
                                    cart[existingIndex].quantity += quantity;
                                } else {
                                    cart.push({
                                        title: findItem.title,
                                        price: findItem.price,
                                        quantity: quantity,
                                        mainPhoto: findItem.mainPhoto
                                    });
                                }
                                sessionStorage.setItem('cart', JSON.stringify(cart));
                                alert('장바구니에 담았습니다');
                            }}>장바구니 담기</button>
                            <br /><br />
                        </div></form></ul>
            </div>

        </div>
    )

}


export default Gongguapply;