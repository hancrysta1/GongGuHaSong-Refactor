import Title from "../components/Title";
import Join from "../components/Join.js";
import Menubar from "../components/Menubar";
import styles from "../css/App.module.css";

const Joinpage = () => {
  return (
    <div className={styles.root}>
      <div className={styles.menugrid}><Menubar /></div>
      <div className={styles.content}>
        <Title />
        <Join />
      </div>


    </div>
  );


}

export default Joinpage;