import Title from "../components/Title";
import Productcomponent from "../components/Productcomponent";
import Mymenubar from "../components/Mymenubar";
import styles from "../css/App.module.css";
import Quantitycomponent from "../components/Quantitycomponent";
import { useState,useEffect } from "react";

const Sale = ({product}) => {
  const [sale, setSale] = useState([])
  const [quantity, setQauntity] = useState([]);
  const [finish, setFinish] = useState([]);


  function calculateDday(item) {
    let endDay = new Date(item.finishDate)
    return endDay.getTime();
  }

  function calculatedday(item) {
    let startDay = new Date(item.startDate)
    return startDay.getTime();
  }

  function calculateDay(item) {
    if(item.length !==0){
      let endDay = new Date(item[0].finishDate)
      return endDay.getTime();
  

    }
  }

  function calculateday(item) {
    if(item.length !== 0) {
          let startDay = new Date(item[0].startDate)
    return startDay.getTime();

    }
  }




  useEffect(() => {
    const today = new Date();
    const ctoday = today.getTime();


    const salefilter = product.filter((item) => {

      return item.managerId === sessionStorage.user_id


    })

    
    if(salefilter.length >1) {
      let mainDdayfilter = salefilter.filter((item) => {

        return (calculateDday(item) >= ctoday) && (calculatedday(item) <= ctoday);
      })
  
      setSale(mainDdayfilter)
  
  
  
      let quantityfilter = salefilter.filter((item) => {
        return (calculatedday(item) >= ctoday);
  
      })
  
      quantityfilter.sort((a, b) => new Date(a.finishResearch) - new Date(b.finishResearch))

      setQauntity(quantityfilter);
  
      let finishfilter = salefilter.filter((item) => {
        return (calculateDday(item) <= ctoday)
      })
  
      setFinish(finishfilter)
    } else {

      if((calculateDay(salefilter) >= ctoday) && (calculateday(salefilter) <= ctoday)) {
        setSale(salefilter)

      }
      else if ((calculateday(salefilter) < ctoday)) {
       
        setQauntity(salefilter)
      }

      else {

        setFinish(salefilter)
      }
    }
    
  }, [])

  return (
    <div className={styles.root}>
      <div className={styles.menugrid}><Mymenubar /></div>
      <div className={styles.content}>
        <Title />
        {sale.length !== 0 && sale.map(sale => 
      <Productcomponent key={sale._id} 
      main={sale}
      />
      )} 

        {quantity.length !== 0 && quantity.length !== 0 && quantity.map(quantity => 
      <Quantitycomponent key={quantity._id} 
      main={quantity}
      />
        )} 

        <div className={styles.transparent}>
        {finish.length !== 0 && finish.length !== 0 && finish.map(finish => 
      <Productcomponent key={finish._id} 
      main={finish}
      />
      )}  


        </div>


      </div>


    </div>
  );


}

export default Sale;