import Title from "../components/Title";
import Privacy from "../components/Privacy";
import Mymenubar from "../components/Mymenubar";
import styles from "../css/App.module.css";

const Privacycheck = () => {
  return (
    <div className={styles.root}>
      <div className={styles.menugrid}><Mymenubar /></div>
      <div className={styles.content}>
        <Title />
        <Privacy />
      </div>


    </div>
  );


}

export default Privacycheck;