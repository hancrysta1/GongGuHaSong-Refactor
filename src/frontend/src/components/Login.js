import styles from "../css/Login.module.css";
import { useState, useEffect } from "react";
import axios from "axios";
import {  Link, useNavigate } from "react-router-dom";


const Login = () => {
  const [inputId, setInputId] = useState('')
  const [inputPw, setInputPw] = useState('');



  const handleInputId = (e) => {
      setInputId(e.target.value)
  }

  const handleInputPw = (e) => {
      setInputPw(e.target.value)
  }

  const history = useNavigate();

  const onClickLogin = async () => {
    const users = await axios.get('/member').then((res) => {return res.data});
    

    try{
      
    const user = users.find((users) => users.pid === inputId);

    if (!user) {
      alert("아이디 존재하지 않거나 바르지 않습니다.");
    } else if (user.pwd !== inputPw) {
      alert("비말번호가 바르지 않습니다.");
    }
    else {
      sessionStorage.setItem('user_id', inputId)
      history(`/`);

    }
            
    } catch (error) {

      //실패하면 throw new Error("") 값 출력
    window.alert(error);
  }
}




    return (
      <div className={styles.formcontent}>
        <ul>

          <li className={styles.formfont}>아이디</li>
          <li className={styles.formfont}>비밀번호</li>
        </ul>

        <ul className={styles.forminput}>
          
            <li><input type="text" name="userId" maxLength="20" value={inputId} onChange={handleInputId}/></li>
            <li><input type="password" name="userPassward" maxLength="20" value={inputPw} onChange={handleInputPw}/></li>
            <div className={styles.buttongroup}>
              <input className={styles.submit} id="submit" type="submit" value="로그인" onClick={onClickLogin}/>
              <Link to="/join"><input className={styles.reset} id="reset" type="reset" value="회원가입" /></Link>
            </div>

        </ul>

      </div >
    )
  }


export default Login;
