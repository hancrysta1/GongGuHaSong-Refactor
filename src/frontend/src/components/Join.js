import React, { useEffect } from 'react';
import styles from "../css/Join.module.css"
import { useState } from "react";
import axios from 'axios';
import { useNavigate } from "react-router-dom";


function Join() {
  const history = useNavigate();
  const [checktnotcie, setChecknotice] = useState("");
  const [newmember, setNewmember] = useState({
    name: '',
    pid: '',
    pwd: '',
    phone: '',
    email: '',
    address: ''
  });

  const { name, pid, pwd, phone, email, address } = newmember;

  const onChange = (e) => {
    const { value, name } = e.target; //우선 우선 e.target 에서 name 과 value 를 추출
    setNewmember({
      ...newmember, // 기존의 input 객체를 복사한 뒤
      [name]: value // name 키를 가진 값을 value 로 설정
    });
  };

  const onReset = () => {
    history('/login');
  };

  const passwordcheck = (e) => {
    const pwdcheck = e.target.value;

    if (pwdcheck !== pwd) {
      setChecknotice("비밀번호가 맞지 않습니다.")
    }
    else {
      setChecknotice("비밀번호가 동일합니다.")
    }

  }



  const idcheck = async () => {
    const users = await axios.get('/member').then((res) => { return res.data });
    const usersid = users.filter((item) => { return item.pid === pid })
    if (usersid.length === 0) {
      alert("사용 가능한 아이디입니다.")
      
    }
    else {
      alert("중복된 아이디입니다.")
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

  
await axios({
        method: "POST",
        url: '/member', 
        data: newmember
       
      }).then((res) => {
        if (res.data.pid === pid) {
          alert('회원가입이 완료되었습니다.')
          history(`/`);
        }
        else { }
      });


    
  }



  return (
    <div className={styles.formcontent}>
      <ul>

        <li className={styles.formfont}>이름</li>
        <li className={styles.formfont}>아이디</li>
        <li className={styles.formfont}>비밀번호</li>
        <li className={styles.formfont}>비밀번호확인</li>

        <li className={styles.formfont}>연락처</li>

        <li className={styles.formfont}>숙명 이메일</li>
        <li className={styles.formfont}>주소</li>
      </ul>

      <ul className={styles.forminput}>
        <form onSubmit={handleSubmit}>
          <li><input type="text" id="name" name="name" maxLength="20" onChange={onChange} value={newmember.name}/></li>
          <li><input type="text" id="pid" name="pid" maxLength="20" onChange={onChange} value={newmember.pid} />
          </li>
          <li><input type="password" id="pwd" name="pwd" minLength="8" onChange={onChange} value={newmember.pwd} /></li>
          <li><input type="password" name="checkPassword" minLength="8" onChange={passwordcheck} /></li>
          <li><input type="tel" id="phone" name="phone" placeholder="010-1234-5678" pattern="[0-9]{3}-[0-9]{4}-[0-9]{4}" maxLength="13" onChange={onChange} value={newmember.phone} /></li>
          <li> <input type="text" id="email" name="email" onChange={onChange} value={newmember.email} /></li>
          <li>< input className={styles.addressform} type="text" id="address" name="address" onChange={onChange} value={newmember.address} /></li>
          <div className={styles.buttongroup}>
            <button className={styles.submit} type="submit" id="submit" name="submit" >회원가입</button>
          </div>

        </form>
        <button onClick={onReset} className={styles.reset} type="button">취소하기</button>

      </ul>

      <ul className={styles.formnotice}>
        <li className={styles.noticefont}></li>
        <li className={styles.noticefont}><button className={styles.idcheck} type="button" onClick={idcheck}>중복확인</button></li>
        <li className={styles.noticefont}>8자 이상 영문 숫자 입력</li>
        <li className={styles.noticefont} style={{ color: "red" }}>{checktnotcie}</li>
        <li className={styles.noticefont}>- 필수 입력</li>
        <li className={styles.noticefont}>@sookmyung.ac.kr까지 입력</li>
        <li className={styles.noticefont}></li>
      </ul>
    </div >
  )

}


export default Join;