import styles from "../css/Productcomponent.module.css";
import { Link } from "react-router-dom";
import fullheart from "../image/fullheart.png";
import emptyheart from "../image/emptyheart.png"
import { useState, useEffect } from "react";
import productimg from "../image/product.jpg"
import axios from "axios";


const Productcomponent = ({ main }) => {
      //좋아요 추가
      const [likepost, setLikepost] = useState({
        pid: sessionStorage.user_id,
        name: main.title,
        startDate: main.startDate,
        endDate: main.finishDate,
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

    let heartname = hearts.find((item) => item.name === main.title)
    if (heartname !== undefined) {
      setHeartid(heartname.id)
      setHeart(true);
    }
  }

  //Dday 계산
  const [Dday, setDday] = useState("0");
  const calculateDday = () => {
    const today = new Date();
    const endDay = new Date(main.finishResearch);
    const distance = endDay.getTime() - today.getTime();
    const day = Math.floor(distance / (1000 * 60 * 60 * 24) * (-1));
    return setDday((prev) => day);
  }


  //신청 수량 계산
  const [applyquantity, getApplyquantity] = useState(0);
  const calculateRate = async () => {
    await axios.get('/survey',
      { params: { title: main.title } }).then((res) => {

        getApplyquantity(res.data);
      }

      )
  }





  useEffect(() => {
    calculateDday();
    calculateRate();
    heartlists();
  }, [])


  return (
    <div className={styles.productbox}>
      <Link to={`/quantity/${main._id}`} style={{ color: "black" }}>
        <div className={styles.productimgbox}>
          <img className={styles.productimg} src={main.mainPhoto} alt="상품이미지" />
        </div>
        <div className={styles.qdatebox}>D{Dday}</div>
        <div className={styles.productcontent}>
          <p className={styles.producttitle}>{main.title}</p>
          <p className={styles.progress}>수량조사 진행률: {Math.ceil(applyquantity / main.min_count * 100)}%</p>
        </div>
      </Link>
      <div className={styles.heart}>
        <img onClick={clickLike} src={heart ? like : nonelike} alt="찜" style={{ width: "40px", height: "40px" }} />

      </div>



    </div>
  )

}

export default Productcomponent;
