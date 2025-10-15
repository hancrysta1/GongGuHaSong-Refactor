import styles from "../css/Info.module.css";
import Period from "./Period";
import { useState, useEffect } from "react";
import nsicon from "../image/nsicon.png"
import { Link, useParams } from "react-router-dom";
import yfullheart from "../image/yfullheart.png"
import yemptyheart from "../image/yemptyheart.png"
import productimage from "../image/product.jpg"
import Messagemodal from "./Messagemodal";
import axios from "axios";



const Product = ({ findItem }) => {
    //좋아요 추가
    const [likepost, setLikepost] = useState({
        pid: sessionStorage.user_id,
        name: findItem.title,
        startDate: findItem.startDate,
        endDate: findItem.finishDate,
        end: 0
    });
    const { pid, name, startDate, endDate, end } = likepost;


    // 좋아요 처리
    const [like, nonelike] = [yfullheart, yemptyheart]
    const [heart, setHeart] = useState(false);
    const [heartid, setHeartid] = useState("");
    const clickLike = async () => {
        ///true인 상태에서 clickliek 누르면 삭제 
        if (heart === true) {
            setHeart(false);
            await axios.delete('/my/like/' + heartid)

        }
        else {
            setHeart(true);
            await axios.post('/my/like', likepost)

        }
    }
    
    //좋아요 가져오기
    const heartlists = async () => {
        const pid = sessionStorage.user_id;
        const hearts = await axios.get('/my/like/' + pid).then((res) => { return res.data });  ///hearts에 _id있음

        let heartname = hearts.find((item) => item.name === findItem.title)
        if (heartname !== undefined) {
            setHeartid(heartname.id)
            setHeart(true);
        }
    }

    // 디데이 계산
    const [Dday, setDday] = useState("0");
    const calculateDday = () => {
        const today = new Date();
        const endDay = new Date(findItem.finishDate);
        const distance = endDay.getTime() - today.getTime();
        const day = Math.floor(distance / (1000 * 60 * 60 * 24) * (-1));
        return setDday((prev) => day);
    }

    //수량 계산
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
        heartlists();
        calculateRate();

        
    }, [])


    //쪽지 modal open 관리
    const [modalOpen, setModalOpen] = useState(false);

    const openModal = () => {
      setModalOpen(true);
    };
    const closeModal = () => {
      setModalOpen(false);
    }


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
                    <li>{Math.ceil(applyquantity / findItem.min_count * 100)}%</li><br />
                    <li>{findItem.min_count - applyquantity}개</li><br />
                </ul>


                <ul className={styles.buttongroup}>
                    <li><Link to={`/gongguapply/${findItem._id}`}><button className={styles.b1}>공구<br />참여하기</button></Link></li>
                    <li><button className={styles.b2} onClick={openModal}>총대에게<br />쪽지보내기</button></li>

                    <li><div className={styles.heart}>
                        <img onClick={clickLike} src={heart ? like : nonelike} alt="찜안함" style={{ width: "70px", height: "70px" }} /></div>
                    </li>

                </ul>



            </div>
                
            {modalOpen ===true ? <Messagemodal open={modalOpen} close={closeModal} counter={findItem.managerId} itemtitle={findItem.title}/>:null}


            <div className={styles.boxes}>
            <ul className={styles.navbar_dname}>
                    <a href="#aaa"><li>상세정보</li></a>
                    <a href="#bbb"><li>진행기간</li></a>
                    <a href="#ccc"><li>유의사항</li></a>
                </ul>
                <div className={styles.line}></div>

                <div className={styles.box3}><a id="aaa"></a>
                    <p className={styles.intro}><img src={nsicon} alt="icon" style={{ width: "50px", height: "40px" }} /> 프로젝트 소개</p>
                    <p className={styles.content}>{findItem.info}</p>
                    <p className={styles.content}><img src={findItem.sizePhoto} alt="옷" style={{ width: "100%", height: "100%" }} /></p>

                </div>

                <div className={styles.box3}><a id="bbb"></a>
                    <p className={styles.intro}><img src={nsicon} alt="icon" style={{ width: "50px", height: "40px" }} /> 진행기간</p>
                    <div className={styles.calendar}> <Period startDate={findItem.startDate} finishDate={findItem.finishDate} /> </div>
                </div>

                <div className={styles.box3}><a id="ccc"></a>
                    <p className={styles.intro}><img src={nsicon} alt="icon" style={{ width: "50px", height: "40px" }} /> 유의사항</p>
                    <p className={styles.content}>{findItem.notice}</p>
                </div>

            </div>

        </div>
    )
}

export default Product;