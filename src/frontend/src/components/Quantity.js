import styles from "../css/Info.module.css";
import Period from "./Period";
import { useState } from "react";
import { Link } from "react-router-dom";
import nsicon from "../image/nsicon.png"
import fullheart from "../image/yfullheart.png"
import emptyheart from "../image/yemptyheart.png"
import { useEffect } from "react";
import axios from "axios";
import Messagemodal from "./Messagemodal";

const Quantity = ({ findItem }) => {

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
    const [like, nonelike] = [fullheart, emptyheart]
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

  const heartlists = async () => {
    const pid = sessionStorage.user_id;
    const hearts = await axios.get('/my/like/' + pid).then((res) => { return res.data });  ///hearts에 _id있음

    let heartname = hearts.find((item) => item.name === findItem.title)
    if (heartname !== undefined) {
      setHeartid(heartname.id)
      setHeart(true);
    }
  }



    // 공구 열기 조건 만족-안함
    const [open, setOpen] = useState(false);
    const onChange = () => {
        setOpen((prev) => !prev);
    }

    //Dday 계산
    const [Dday, setDday] = useState("0");
    const calculateDday = () => {
        const today = new Date();
        const endDay = new Date(findItem.finishResearch);
        const distance = endDay.getTime() - today.getTime();
        const day = Math.floor(distance / (1000 * 60 * 60 * 24) * (-1));
        return setDday((prev) => day);
    }

    //신청 수량 확인
    const [applyquantity, getApplyquantity] = useState(0);
    const calculateRate = async () => {
        await axios.get('/survey',
            { params: { title: findItem.title } }).then((res) => {

                getApplyquantity(res.data);
                console.log(applyquantity)
            }

            )
    }

    const [apply, setApply] = useState([{
        count: 0
    }]);
    const { count } = apply


    const sendapply = async (count) => {
        console.log(apply)
        await axios.post('/survey', {count:count},
            { params: { title: findItem.title, userId: sessionStorage.user_id } },
            { hearder: { 'Content-type': 'application/json' } },
        ).then((res) => {
            if (res.status === 200) {
                alert('수량조사가 완료되었습니다!')
            }
            else {
                alert('로그인 후 이용해주세요')
            }
        })
    }


    const prom = async () => {
        let prom = prompt('총 구매 예정 수량을 입력해주세요', '')
        let counts = Number(prom)
        if(counts >0) {
            console.log(counts)
            //setApply({...apply, count: counts})
            sendapply(counts);
        }
        else {
            alert("1 이상의 숫자를 입력해주세요")
        }


    }


    const [modalOpen, setModalOpen] = useState(false);

    const openModal = () => {
        setModalOpen(true);
    };
    const closeModal = () => {
        setModalOpen(false);
    }




    useEffect(() => {
        heartlists();
        calculateDday();
        calculateRate();
    }, [])



    return (

        <div className={styles.quantity}>
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
                    <li>D{Dday}</li><br />
                    <li>{findItem.price}원</li><br />
                    <li>{Math.ceil(applyquantity / findItem.min_count * 100)}%</li><br />
                    <li>{findItem.min_count - applyquantity > 0 ? <p className={styles.count}>{findItem.min_count - applyquantity}개</p>: "최소 수량 충족"}</li><br />
                </ul>


                <ul className={styles.buttongroup}>
                    <li><button className={styles.b1} onClick={prom}>수량조사<br />참여하기</button></li>
                    <li><button className={styles.b2} onClick={openModal}>총대에게<br />쪽지보내기</button></li>
                    <li><div className={styles.heart}>
                        <img onClick={clickLike} src={heart ? like : nonelike} alt="찜안함" style={{ width: "70px", height: "70px" }} /></div>
                    </li>

                </ul>

            </div>

            {modalOpen === true ? <Messagemodal open={modalOpen} close={closeModal} counter={findItem.managerId} itemtitle={findItem.title} /> : null}



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
                    <div className={styles.calendar}> <Period startDate={findItem.startResearch} finishDate={findItem.finishResearch} /> </div>
                </div>

                <div className={styles.box3}><a id="ccc"></a>
                    <p className={styles.intro}><img src={nsicon} alt="icon" style={{ width: "50px", height: "40px" }} /> 유의사항</p>
                    <p className={styles.content}>{findItem.notice}</p>
                </div>
            </div>

        </div>
    )

}


export default Quantity;