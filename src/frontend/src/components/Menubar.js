import styles from "../css/Menubar.module.css";
import mypage from "../image/mypage.png";
import heart from "../image/heart.png";
import message from "../image/message.png";
import alert from "../image/alert.png";
import {  useNavigate } from "react-router-dom";


import { Link } from "react-router-dom";

function Menubar() {
  const history = useNavigate();
  const onLogout = () => {
    // sessionStorage 에 user_id 로 저장되어있는 아이템을 삭제한다.
      sessionStorage.removeItem('user_id')
      // App 으로 이동(새로고침)
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
      <p className={styles.menu}>공구 참여하기</p>
      <div >
        <ul>
          <li className={styles.categories}><Link to="/clothes" style={{ color: "#707070" }}>의류</Link></li>
          <li className={styles.categories}><Link to="/badge" style={{ color: "#707070" }}>뱃지</Link></li>
          <li className={styles.categories}><Link to="/pouch" style={{ color: "#707070" }}>파우치</Link></li>
          <li className={styles.categories}><Link to="/mungu" style={{ color: "#707070" }}>문구류</Link></li>
          <li className={styles.categories}><Link to="/etc" style={{ color: "#707070" }}>기타</Link></li>
        </ul>
      </div>
      <p className={styles.menu}><Link to="/newgonggu" style={{ color: "#707070" }}>새로운 공구 열기</Link></p>
    
      {sessionStorage.length !== 0 ?         <button className={styles.logout} onClick={onLogout}>로그아웃</button>
: null}
    </nav>

  );
}


export default Menubar;