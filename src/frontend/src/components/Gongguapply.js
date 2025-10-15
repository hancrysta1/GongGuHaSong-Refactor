import React, { useEffect } from 'react';
import styles from '../css/Gongguapply.module.css';
import { useState, useRef } from "react";
import Iteration from './Iteration';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function Gongguapply({ findItem }) {
    const history = useNavigate();
    const [inputs, setInputs] = useState({
        person: '',
        p_tel: '',
        quantity: '',
        sname: '',
        y_time: '',
        address: '',
        method: ''
    });




    const { person, p_tel, quantity, size, sname, y_time,  address, method } = inputs;

    const onChange = (e) => {
        const { value, name } = e.target; // 우선 e.target 에서 name 과 value 를 추출
        setInputs({
          ...inputs, // 기존의 input 객체를 복사한 뒤
          [name]: value // name 키를 가진 값을 value 로 설정
        });
      };


    const onReset = () => {
        setInputs({
            person: '',
            p_tel: '',
            quantity: '',
            size: '',
            name: '',
            y_time: '',
            address: '',
        })
    };

    const [inputText, setInputText] = useState('');
    const [sizes, setSizes] = useState([]);

    const handlesizeChange = e => setInputText(e.target.value);

    //추가하는 함수
    const handleClick = () => {
        setSizes([...sizes, inputText]);
        
        setInputText('');

    }

  

    const handleDelete = id => {
        const newList = sizes.filter(size => size.id !== id);
        setSizes(newList);
    };



    const handleSubmit = async(e) => {
        e.preventDefault();
        await axios({
            method: "POST",
            url: '/order', 
            data: {
            userId: inputs.person,
            phoneNumber: inputs.p_tel,
            total_Count: inputs.quantity,
            userName: inputs.sname,
            depositTime: inputs.y_time,
            method: inputs.method,
            address: inputs.address,
            sizeCount: sizes
            },
            params: {title: findItem.title}
            
           
          }).then((res) => {
            alert("신청되었습니다!");
            if (res.status === 200) {
                
              history(`/product/${findItem._id}`);
            } else if (res === null){ 

            }
            else { }
          });
    



    }

useEffect (() => {
    setInputs({...inputs, person: sessionStorage.user_id});

},[])

    return (
        <div className={styles.gongguapply}>
            <div className={styles.gongguapplytab}>
                <div className={styles.formname}>공구 신청 폼</div>
                <div className={styles.line}></div>
            </div>

            <div className={styles.gongguinfo}>

                <p>{findItem.title}</p>
                <img src={findItem.mainPhoto} alt="상품사진" style={{ width: "250px", height: "250px" }} />

                <p>가격 {findItem.price}원</p>
                <p>입금 정보 <br/><br/>{findItem.accountName}<br /><br />{findItem.account}</p>
                <img src={findItem.sizePhoto} alt="상세사항" style={{ width: "250px", height: "150px" }} />

            </div>

            <div className={styles.form}>
                <ul className={styles.applyform}>
                    <form onSubmit={handleSubmit}>

                        <li><label htmlFor="id">아이디&nbsp;&nbsp;&nbsp;</label>&nbsp;&nbsp;&nbsp;{sessionStorage.user_id}</li>
                        <li><label htmlFor="tel">연락처&nbsp;&nbsp;&nbsp;</label><input type="tel" name="p_tel" placeholder="010-1234-5678"
                            pattern="[0-9]{3}-[0-9]{4}-[0-9]{4}" maxLength={13} onChange={onChange}/></li>
                        <li><label htmlFor="quantity">구매수량</label><input type="number" name="quantity" min="1" step="1" placeholder="총 구매수량을 적어주세요" onChange={onChange}/></li>

                        <li>옵션&nbsp;&emsp; <input
                            value={inputText}
                            onChange={handlesizeChange}
                            placeholder="옵션: 수량 입력"
                        />
                            <button type="button" onClick={handleClick} className={styles.addbutton}>추가</button>
                            {sizes.map((sizes) =><div key={sizes.index}>
                            <p >
                                 {sizes} <button type="button" onClick={() => handleDelete(sizes.id)}>삭제</button></p>
                            </div>
                                 )}
                        </li>

                        <li><label htmlFor="name">입금자명</label><input type="text" name="sname" onChange={onChange}/></li>

                        <li><label htmlFor="time">입금시간</label><input type="datetime-local" name="y_time" onChange={onChange}/></li>

                        <li><label htmlFor="method">배부방식</label></li>
                        <li> <input type="radio" name="method" id="off" value="현장배부" onChange={onChange}/><label htmlFor="off">오프라인 현장 배부</label></li>

                        <li><input type="radio" name="method" id="deliver" value="택배" onChange={onChange}/><label htmlFor="deliver">택배</label></li>
                        <li><label htmlFor="address">&nbsp;&nbsp;&nbsp;주소&nbsp;&nbsp;&nbsp;</label><input type="text" name="address" placeholder="택배 배부를 선택하신 경우에만 적어주세요" style={{ width: "420px" }} onChange={onChange}/></li>

                        <div className={styles.buttongroup}>
                            <button className={styles.submit} type="submit" >공구참여</button>&nbsp;
                            <button onClick={onReset} className={styles.reset} type="reset">취소하기</button>
                            <br /><br />
                        </div></form></ul>
            </div>

        </div>
    )

}


export default Gongguapply;