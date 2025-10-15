import Title from "../components/Title";
import Quantitycomponent from "../components/Quantitycomponent";
import Menubar from "../components/Menubar";
import styles from "../css/App.module.css";
import { useState, useEffect } from "react";

const Quantityinfo = ({product}) => {

  const [info, setInfo] = useState([]);

  function calculateDday(item) {
    let endDay = new Date(item.finishResearch)
    return endDay.getTime();
  }

  


  useEffect(() => {
    product.sort((a, b) => new Date(a.finishResearch) - new Date(b.finishResearch))

    const today = new Date();
    const ctoday = today.getTime();

    let mainfilter = product.filter((item) => {
      return calculateDday(item) > ctoday;
    })

    setInfo(mainfilter);

  }, [])


  return (
    <div className={styles.root}>
      <div className={styles.menugrid}><Menubar /></div>
      <div className={styles.content}>
        <Title />
        {info.map(info =>
      <Quantitycomponent key={info._id} 
      main={info}
      />

      )}

      </div>
    </div>
  );

      

  }

export default Quantityinfo;