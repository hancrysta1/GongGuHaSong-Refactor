import styles from "../css/Menubar.module.css";
import mypage from "../image/mypage.png";
import heart from "../image/heart.png";
import message from "../image/message.png";
import alert from "../image/alert.png";
import {  useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

import { Link } from "react-router-dom";

function Menubar() {
  const history = useNavigate();
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    const updateCartCount = () => {
      const cart = JSON.parse(sessionStorage.getItem('cart') || '[]');
      const total = cart.length;
      setCartCount(total);
    };
    updateCartCount();
    // sessionStorage 변경 감지를 위해 주기적 체크
    const interval = setInterval(updateCartCount, 1000);
    return () => clearInterval(interval);
  }, []);

  const onLogout = () => {
      sessionStorage.removeItem('user_id')
      history(`/`);
  }

  return (
    <nav className={styles.menubar}>
      <div>
        <ul>
          <li className={styles.mymenu}>
          {sessionStorage.length !== 0 ? <Link to="/order"><img src={mypage} alt="image" style={{ width: "60px", height: "60px", margin: "0", }} /></Link>
              : <Link to="/login"><img src={mypage} alt="image" style={{ width: "60px", height: "60px", margin: "0", }} /></Link>}

          </li>
          <li className={styles.mymenu}>
          {sessionStorage.length !== 0 ? <Link to="/wish"><img src={heart} alt="image" style={{ width: "60px", height: "60px", margin: "0", }} /></Link>
              : <Link to="/login"><img src={heart} alt="image" style={{ width: "60px", height: "60px", margin: "0", }} /></Link>}
          </li>
          <li className={styles.mymenu}>
          {sessionStorage.length !== 0 ? <Link to="/message"><img src={message} alt="image" style={{ width: "60px", height: "60px", margin: "0", }} /></Link>
              : <Link to="/login"><img src={message} alt="image" style={{ width: "60px", height: "60px", margin: "0", }} /></Link>}
          </li>
        </ul>
      </div>
      <div className={styles.alertbox}>
        <img src={alert} alt="image" style={{ widht: "20px", height: "20px" }} />
      </div>
      <br />
      <p className={styles.menu}><br /><Link to="/quantityinfo" style={{ color: "#707070" }}>수량조사 참여하기</Link></p>
      <p className={styles.menu}>구매하기</p>
      <div >
        <ul>
          <li className={styles.categories}><Link to="/clothes" style={{ color: "#707070" }}>의류</Link></li>
          <li className={styles.categories}><Link to="/badge" style={{ color: "#707070" }}>뱃지</Link></li>
          <li className={styles.categories}><Link to="/pouch" style={{ color: "#707070" }}>파우치</Link></li>
          <li className={styles.categories}><Link to="/mungu" style={{ color: "#707070" }}>문구류</Link></li>
          <li className={styles.categories}><Link to="/etc" style={{ color: "#707070" }}>기타</Link></li>
        </ul>
      </div>
      <p className={styles.menu}><Link to="/newgonggu" style={{ color: "#707070" }}>새로운 상품 등록</Link></p>
      <p className={styles.menu} style={{ position: 'relative', display: 'inline-block' }}>
        <Link to="/cart" style={{ color: "#707070" }}>
          장바구니
        </Link>
        {cartCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '22px',
            right: '10px',
            background: '#E53935',
            color: '#fff',
            borderRadius: '50%',
            width: '22px',
            height: '22px',
            fontSize: '13px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'sans-serif',
            lineHeight: 1,
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
          }}>{cartCount > 99 ? '99+' : cartCount}</span>
        )}
      </p>
      <p className={styles.menu}><Link to="/mypage" style={{ color: "#707070" }}>마이페이지</Link></p>

      {sessionStorage.length !== 0 ?         <button className={styles.logout} onClick={onLogout}>로그아웃</button>
: null}
    </nav>

  );
}


export default Menubar;