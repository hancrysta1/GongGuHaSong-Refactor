import Title from "../components/Title";
import Mymenubar from "../components/Mymenubar";
import styles from "../css/App.module.css";
import { useState } from "react";
import axios from "axios";
import { useEffect } from "react";
import Productcomponent from "../components/Productcomponent";
import Quantitycomponent from "../components/Quantitycomponent"

const Wish = ({product}) => {
  const [main, getMain] = useState([]);
  const [like, getLike] = useState([]);

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




  const [wish, getWish] = useState([]);

//   const getWishs = async () => {
//    await axios.get("/my/like/" + sessionStorage.user_id).then((res) => {
//       let wishfilter = product.filter(x => 
//         {
//           return res.data.some(function(y) {
//             return x.title == y.name
//           })
//         }
//         )
//      getWish(wishfilter)
//    }
//    );

//  }



  useEffect(() => {
     axios.get("/my/like/" + sessionStorage.user_id).then((res) => {
      let wishfilter = product.filter(x => 
        {
          return res.data.some(function(y) {
            return x.title == y.name
          })
        }
        )



        const today = new Date();
        const ctoday = today.getTime();
    
    
        
        if(wishfilter.length>1) {
          let mainDdayfilter = wishfilter.filter((item) => {
    
            return (calculateDday(item) > ctoday) && (calculatedday(item) < ctoday);
          })
      
          setSale(mainDdayfilter)
      
      
          let quantityfilter = wishfilter.filter((item) => {
            return (calculatedday(item) > ctoday);
      
          })
      
          quantityfilter.sort((a, b) => new Date(a.finishResearch) - new Date(b.finishResearch))
    
          setQauntity(quantityfilter);
    
      
          let finishfilter = wishfilter.filter((item) => {
            return (calculateDday(item) < ctoday)
          })
      
          setFinish(finishfilter)
        } else {
    
          if((calculateDay(wishfilter) > ctoday) && (calculateday(wishfilter) < ctoday)) {
            setSale(wishfilter)
    
          }
          else if ((calculateday(wishfilter) > ctoday)) {
           
            setQauntity(wishfilter)
          }
    
          else {
    
            setFinish(wishfilter)
          }
        }
    



   }
   );



    
     
    },[])


    return (
      <div className={styles.root}>
        <div className={styles.menugrid}><Mymenubar /></div>
        <div className={styles.content}>
          <Title />
          {/* {product.map(product => 
      <Wishcomponent key={product.id} 
      main={product}
      />
      )} */}
          {sale.length !== 0 && sale.map((sale) =>
              <Productcomponent key={sale._id}
                main={sale}
              />
            )

          }   
          
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
  

      export default Wish;