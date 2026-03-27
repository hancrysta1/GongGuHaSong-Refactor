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
    const endDay = new Date(main.finishDate);
    const distance = endDay.getTime() - today.getTime();
    const day = Math.floor(distance / (1000 * 60 * 60 * 24) * (-1));
    return setDday((prev) => day);
  }


  //신청 수량 계산
  const [applyquantity, getApplyquantity] = useState(0);
  const calculateRate = async () => {
    try {
      const res = await axios.get('/sell', { params: { title: main.title } });
      const data = Array.isArray(res.data) ? res.data.length : (typeof res.data === 'number' ? res.data : 0);
      getApplyquantity(data);
    } catch(e) {
      getApplyquantity(0);
    }
  }

  const percent = Math.min(Math.ceil(applyquantity / main.min_count * 100), 100);
  const isAchieved = applyquantity >= main.min_count;





  useEffect(() => {
    calculateDday();
    calculateRate();
    heartlists();
  }, [])


  return (
    <div className={styles.productbox}>
      <Link to={`/product/${main._id}`} style={{ color: "black" }}>
        <div className={styles.productimgbox}>
          <img className={styles.productimg} src={main.mainPhoto} alt="상품이미지" />
        </div>
        <div className={styles.datebox}>D{Dday}</div>
        <div className={styles.productcontent}>
          <p className={styles.producttitle}>{main.title}</p>
          <p className={styles.progress} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            달성률 {percent}%
            <span style={{
              fontSize: '12px',
              padding: '2px 8px',
              borderRadius: '10px',
              color: '#fff',
              fontWeight: 'bold',
              background: isAchieved ? '#4CAF50' : '#FF9800'
            }}>{isAchieved ? '달성' : '미달'}</span>
          </p>
        </div>
      </Link>
      <div className={styles.heart}>
        <img onClick={clickLike} src={heart ? like : nonelike} alt="찜" style={{ width: "40px", height: "40px" }} />

      </div>
      <button
        style={{
          position: 'absolute',
          left: '230px',
          top: '289px',
          background: 'none',
          border: 'none',
          fontSize: '28px',
          cursor: 'pointer',
          padding: 0
        }}
        title="장바구니 담기"
        onClick={(e) => {
          e.preventDefault();
          const cart = JSON.parse(sessionStorage.getItem('cart') || '[]');
          const existingIndex = cart.findIndex(item => item.title === main.title);
          if (existingIndex >= 0) {
            cart[existingIndex].quantity += 1;
          } else {
            cart.push({
              title: main.title,
              price: main.price,
              quantity: 1,
              mainPhoto: main.mainPhoto
            });
          }
          sessionStorage.setItem('cart', JSON.stringify(cart));
          alert('장바구니에 담았습니다');
        }}
      >
        🛒
      </button>



    </div>
  )

}

export default Productcomponent;
