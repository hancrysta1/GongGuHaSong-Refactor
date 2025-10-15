import styles from "../css/Message.module.css"
import Messagemodal from "./Messagemodal";
import { useState } from "react";



const Message = ({counter, itemtitle}) => {
    const [modalOpen, setModalOpen] = useState(false);

    const openModal = () => {
      setModalOpen(true);
    };
    const closeModal = () => {
      setModalOpen(false);
    }


    return (
    <div className={styles.message}>
        
        <div className={styles.messagebox}>
            <ul className={styles.messagecontainer} onClick={openModal} >
                <li className={styles.receiverid}>{counter}</li>
                <li className={styles.messagecontent}>{itemtitle}</li>
            </ul>
<div className={styles.messagemodal}>
{modalOpen ===true ? <Messagemodal open={modalOpen} close={closeModal} counter={counter} itemtitle={itemtitle}/>:null}

</div>

        </div>
        </div>
    )
}





export default Message;