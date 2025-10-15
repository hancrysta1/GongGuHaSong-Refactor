import styles from "../css/Info.module.css";
import Period from "./Period";
import { useState, useEffect } from "react";
import nsicon from "../image/nsicon.png"
import { Link, useParams } from "react-router-dom";
import yfullheart from "../image/yfullheart.png"
import yemptyheart from "../image/yemptyheart.png"
import productimage from "../image/product.jpg"
import axios from "axios";


const Productlead = ({ findItem }) => {


    const [Dday, setDday] = useState("0");
    const calculateDday = () => {
        const today = new Date();
        const endDay = new Date(findItem.finishDate);
        const distance = endDay.getTime() - today.getTime();
        const day = Math.floor(distance / (1000 * 60 * 60 * 24)*(-1));
        return setDday((prev) => day);
    }


    
    const [applyquantity, getApplyquantity] = useState(0);
    const calculateRate = async () => {
      await axios.get('/sell',
        { params: { title: findItem.title } }).then((res) => {
                
          getApplyquantity(res.data);
        }
  
        )
    }
  
  
  
  

    useEffect(() => {
        calculateDday();
        calculateRate();
      }, [])

    return (
        <div className={styles.product}>
            <div className={styles.information}>
                <div className={styles.producttitle}>{findItem.title}</div>
                <div className={styles.productmanager}>{findItem.managerId}</div>
                <ul className={styles.image}><img src={findItem.mainPhoto} alt="옷" style={{ width: "350px", height: "350px" }} /></ul>
                <ul className={styles.productbox1}>

                    <li>남은 기간</li><br />
                    <li>가격</li><br />
                    <li>공구 진행률</li><br />
                    <li>남은 최소수량</li><br />
                </ul>
                <ul className={styles.productbox2}>
                    <li >D{Dday}</li><br />
                    <li>{findItem.price}</li><br />
                    <li>{Math.ceil(applyquantity/findItem.min_count * 100)}%</li><br />
                    <li>{findItem.min_count - applyquantity}개</li><br />
                </ul>


                <ul className={styles.buttongroup}>
                    <li><button className={styles.b1}>수정하기</button></li>
                    <li><Link to={`/check/${findItem._id}`}><button className={styles.b2}>신청자정보<br/>확인하기</button></Link></li>

                </ul>

            </div>


            <div className={styles.boxes}>
            <ul className={styles.navbar_ldname}>
                    <a href="#aaa"><li>상세정보</li></a>
                    <a href="#bbb"><li>진행기간</li></a>
                    <a href="#ccc"><li>유의사항</li></a>
                </ul>
                <div className={styles.lline}></div>


                <div className={styles.box3}><a id="aaa"></a>
                    <p className={styles.intro}><img src={nsicon} alt="icon" style={{ width: "50px", height: "40px" }} /> 프로젝트 소개</p>
                    <p className={styles.content}>{findItem.info}</p>
                    <p className={styles.content}><img src={findItem.sizePhoto} alt="옷" style={{ width: "100%", height: "100%" }} /></p>
                </div>

                <div className={styles.box3}><a id="bbb"></a>
                    <p className={styles.intro}><img src={nsicon} alt="icon" style={{ width: "50px", height: "40px" }} /> 진행기간</p>
                    <div className={styles.calendar}> <Period startDate={findItem.startDate} finishDate={findItem.finishDate}/> </div>
                </div>

                <div className={styles.box3}><a id="ccc"></a>
                    <p className={styles.intro}><img src={nsicon} alt="icon" style={{ width: "50px", height: "40px" }} /> 유의사항</p>
                    <p className={styles.content}>{findItem.notice}</p>
                </div>

            </div>

        </div>
    )
}

export default Productlead;