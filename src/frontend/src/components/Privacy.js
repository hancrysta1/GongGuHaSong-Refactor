import styles from "../css/Join.module.css";
import privacycheck from "../image/privacycheck.png";
import { useEffect, useState } from "react";
import Privacycheck from "../routes/Privacycheck";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const Privacy = () => {
  
  const [checktnotcie, setChecknotice] = useState("");
  const history = useNavigate();
  const [privacy, setPrivacy] = useState(false);
  const [check, setCheck] = useState("");
  const [user, setUser] = useState([]);
  const [member, setMember] = useState({
    
    pwd: '',
    phone: '',
    email: '',
    address: '',
  });

  const { pwd, phone, email, address } = member;
  const onReset = () => {
    history('/')
  };

  const onChange = (e) => {
    setCheck(e.target.value);
  }

  const onClick = async() => {
    const pid = sessionStorage.user_id;
      const products = await axios.get('/member/'+ pid).then((res) => { return res.data });
      
      if(products.pwd === check) {
        setUser(products)
        setMember({...member, phone: products.phone, email: products.email, address: products.address});

        setPrivacy(true)
      } else {
        alert("잘못된 비밀번호 입니다.")
      }

    
    

  }

  const onmemChange = (e) => {
    const { value, name } = e.target; //우선 우선 e.target 에서 name 과 value 를 추출
    setMember({
      ...member, // 기존의 input 객체를 복사한 뒤
      [name]: value // name 키를 가진 값을 value 로 설정
    });
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


  const handleSubmit = async(e) => {
    e.preventDefault()


    await axios({
        method: "PATCH",
        url: '/my/edit/' + user.pid, 
        data: member,
       
      }).then((res) => {

        if (res.status === 200) {
          alert("회원정보 수정이 완료되었습니다.")
          history(`/`);
        }
        else { }
      });
  }

useEffect(() => {
  

}, [])


return (

    <div>
        {privacy===true ? 
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
          <ul className={styles.pforminput}>
            <form onSubmit={handleSubmit}>
              <li className={styles.pinputcontent}>{user.name}</li>
              <li className={styles.pinputcontent}>{user.pid}</li>
              <li className={styles.pinputcontent}><input type="password" name="pwd" minLength="8" onChange={onmemChange}/></li>
              <li className={styles.pinputcontent}><input type="password" name="userPassword" minLength="8" onChange={passwordcheck}/></li>
              <li className={styles.pinputcontent}>< input type="text" name="phone" maxLength="13" defaultValue={user.phone} onChange={onmemChange}/></li>
              <li className={styles.pinputcontent}>{user.email}</li>
              <li className={styles.pinputcontent}>< input className={styles.addressform} type="text" name="address" defaultValue={user.address} onChange={onmemChange}/></li>
    
              <div className={styles.buttongroup}>
                <input className={styles.psubmit} id="submit" type="submit" value="수정하기" />
                <input onClick={onReset} className={styles.preset} id="reset" type="button" value="취소하기" />
              </div>
    
            </form>
          </ul>

          <ul className={styles.formnotice}>
        <li className={styles.noticefont}></li>
        <li className={styles.noticefont}></li>
        <li className={styles.noticefont}></li>
        <li className={styles.noticefont} style={{ color: "red" }}>{checktnotcie}</li>
        <li className={styles.noticefont}></li>
        <li className={styles.noticefont}></li>
        <li className={styles.noticefont}></li>
      </ul>

          
        </div >
    
  :
  <div className={styles.privacynotice}>
    <form>
    <img className={styles.lock} src={privacycheck} alt="image" style={{ width: "60px", height: "60px", margin: "0", }} />

    <p>본인확인을 위해<br />비밀번호를 다시 한번 입력 바랍니다.</p>
    <p>비밀번호 입력&nbsp;&nbsp;<input type="password" onChange={onChange} style={{width: "300px", height:"26px"}} /></p>
    </form>
    <button className={styles.privacysubmit} id="submit" type="button" onClick={onClick} value="입력완료">입력완료</button>

  </div>}

    
    </div>
  )

    

    
  
    }



export default Privacy;