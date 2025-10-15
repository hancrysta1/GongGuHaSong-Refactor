import React, { useEffect, useState } from 'react';
import styles from '../css/Check.module.css';
import productimg from "../image/product.jpg"
import { useParams } from "react-router-dom";
import axios from 'axios';


const Check = ({check, findItem}) => {
    const [applyquantity, getApplyquantity] = useState(0); 

    const [Dday, setDday] = useState("0");
    const calculateDday = () => {
        const today = new Date();
        const endDay = new Date(findItem.finishDate);
        const distance = endDay.getTime() - today.getTime();
        const day = Math.floor(distance / (1000 * 60 * 60 * 24)*(-1));
        return setDday((prev) => day);
    }

    const calculateRate = async() => {
        await axios.get('/sell', 
        {params : {title: findItem.title}}).then((res) => {
          
          getApplyquantity(res.data);
        }
  
        )
      }

    useEffect(() => {
        calculateDday();
        calculateRate();
      }, [])

    return (
        <div className={styles.check}>
            <div className={styles.tab}>
                <div className={styles.formname}>
                    공구 신청자 리스트
                </div>
                <div className={styles.line1}></div>
            </div>

            <div className={styles.content}>
                <div className={styles.information}>

                    <img className={styles.image} src={findItem.mainPhoto} height="280" width="280" alt=" 옷" />

                    <h2 className={styles.name}>{findItem.title}</h2>
                    <ul className={styles.box1}>
                        <li>남은 기한</li>
                        <li>공구 진행률</li>
                        <li>공구 참여 수</li>
                    </ul>
                    <ul className={styles.box2}>
                        <li>D{Dday}</li>
                        <li>{Math.ceil(applyquantity/findItem.min_count*100)}%</li>
                        <li>{applyquantity}개</li>
                    </ul>

                </div>
            </div>

            <div className={styles.infotab}>

                <div className={styles.info}>

                    <ul className={styles.navbar_dname}>
                        <li >아이디</li>
                        <li >총 수량</li>
                        <li >구매옵션</li>
                        <li >입금시간</li>
                        <li >입금자명</li>
                        <li >배부방식</li>
                        <li >연락처 및 주소</li>


                    </ul>


                    <div className={styles.line2}></div>

                    

                </div>
            </div>
            
            <div className={styles.personcomponent}>
            {check.map(check =>
                        <Person key={check.userId} checkperson={check} />
                    )}



            </div>
        </div >


    )
}


const Person = ({checkperson}) => {
    

    return (
        <div className={styles.personbox}>
            <div className={styles.personboxx}>
                <ul className={styles.person}>
                    <li className={styles.userid}>{checkperson.userId}</li>
                    <li className={styles.option}>{checkperson.total_Count}</li>
                    <li className={styles.size}>
                        
                        <ul>
                         {checkperson.sizeCount.map((item) => <li>{item}</li>)}
                       

                        </ul>
                        
                        </li>
                    <li className={styles.time}>{checkperson.depositTime}</li>
                    <li className={styles.username}>{checkperson.userName}</li>
                    <li className={styles.method}>{checkperson.method}</li>
                    <li className={styles.tel}>{checkperson.phoneNumber}<br/>{checkperson.address}</li>

                </ul>
            </div>
        </div>
    )
}



export default Check;