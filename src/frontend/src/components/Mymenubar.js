import styles from "../css/Menubar.module.css"
import {Link} from "react-router-dom";
import mypage from "../image/mypage.png";
import heart from "../image/heart.png";
import message from "../image/message.png";
import alert from "../image/alert.png";
import {  useNavigate } from "react-router-dom";

function Mymenubar() {
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
            <li className={styles.mymenu}><Link to="/order"><img src={mypage} alt="image" style={{ width: "60px", height: "60px" }} /></Link></li>
            <li className={styles.mymenu}><Link to="/wish"><img src={heart} alt="image" style={{ width: "60px", height: "60px" }} /></Link></li>
            <li className={styles.mymenu}><Link to="/message"><img src={message} alt="image" style={{ width: "60px", height: "60px" }} /></Link></li>
          </ul></div>
          <div className={styles.alertbox}>
            <img src={alert} alt="image" style={{widht: "20px", height: "20px"}}/>
        </div>

        <br />
        <p className={styles.menu}><br /><Link to="/order" style={{color: "#707070"}}>참여중인 공구</Link></p>
        <p className={styles.menu}><Link to="/sale" style={{color: "#707070"}}>진행중인 공구</Link></p>
        <p className={styles.menu}><Link to="/wish" style={{color: "#707070"}}>찜한 공구</Link></p>
        <p className={styles.menu}><Link to="/privacy" style={{color: "#707070"}}>회원정보 수정</Link></p>
      
        <button className={styles.logout} onClick={onLogout}>로그아웃</button>

      </nav>
    )
  }


  export default Mymenubar;