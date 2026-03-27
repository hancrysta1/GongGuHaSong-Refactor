import styles from "../css/Menubar.module.css"
import { Link } from "react-router-dom";

const Title = () => {
    return (
      <div className={styles.title}>
        <p>&nbsp;&nbsp;&nbsp;<Link to="/" style={{ textDecoration: 'none', color: '#0D2D84' }}>공구하송</Link></p>


      </div>

    )
  }

  export default Title;