import Title from "../components/Title";
import Login from "../components/Login";
import Menubar from "../components/Menubar";
import styles from "../css/App.module.css";

const Loginpage = () => {
  return (
    <div className={styles.root}>
      <div className={styles.menugrid}><Menubar /></div>
      <div className={styles.content}>
        <Title />
        <Login />
      </div>


    </div>
  );


}

export default Loginpage;