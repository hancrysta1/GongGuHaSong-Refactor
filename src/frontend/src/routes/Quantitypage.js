import Title from "../components/Title";
import Quantity from "../components/Quantity.js";
import Menubar from "../components/Menubar";
import styles from "../css/App.module.css";
import Quantitylead from "../components/Quantitylead";
import { useParams } from "react-router-dom";


const Quantitypage = ({product}) => {

  let { quantityid } = useParams();
  let findItem = product.find((item) => {
      return item._id == quantityid;
  });

  return (
    <div className={styles.root}>
      <div className={styles.menugrid}><Menubar /></div>
      <div className={styles.content}>
        <Title />
        {sessionStorage.user_id === findItem.managerId  ?
          <Quantitylead findItem={ findItem } />:<Quantity findItem={ findItem } />}
      </div>


    </div>
  );


}

export default Quantitypage;