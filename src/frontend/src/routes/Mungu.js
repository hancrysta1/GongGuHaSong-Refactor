import Title from "../components/Title";
import Productcomponent from "../components/Productcomponent";
import Menubar from "../components/Menubar";
import styles from "../css/App.module.css";
import { useState, useEffect } from "react";

const Clothes = ({product}) => {
  const [main, setMain] = useState([]);


  function calculateDday(item) {
    let endDay = new Date(item.finishDate)
    return endDay.getTime();
  }

  function calculatedday(item) {
    let startDay = new Date(item.startDate)
    return startDay.getTime();
  }


  useEffect(() => {
    product.sort((a, b) => new Date(a.finishDate) - new Date(b.finishDate))

    const today = new Date();
    const ctoday = today.getTime();

    let mainfilter = product.filter((item) => {
      return (calculateDday(item) >= ctoday) && (calculatedday(item) <= ctoday);
    })

    let catefilter = mainfilter.filter((item) => {                   
        return item.category === "mungu"
    }
    )
    setMain(catefilter)

  }, [])
  return (
    <div className={styles.root}>
      <div className={styles.menugrid}><Menubar /></div>
      <div className={styles.content}>
        <Title />
         {main.length !== 0 ? main.map(main => 
      <Productcomponent key={main._id} 
      main={main}
      />
      ): <div className={styles.notice}>아직 진행중인 공구가 없습니다.</div>} 
      </div>


    </div>
  );


}

export default Clothes;