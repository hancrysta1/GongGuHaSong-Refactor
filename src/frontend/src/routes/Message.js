import Title from "../components/Title";
import Message from "../components/Message";
import Mymenubar from "../components/Mymenubar";
import styles from "../css/App.module.css";
import { useState, useEffect } from "react";
import axios from "axios";

const Messagepage = () => {
  const [send, getSend] = useState([])
  const [receive, getReceive] = useState([])
  const [msend, setSend] = useState([]);
  const [mreceive, setReceive] = useState([]);
  const [allmessage, setAllmessage] = useState([]);

  const getSends = async () => {
    await axios.get('/note/send/' + sessionStorage.user_id).then((res) => {
      const messagefilter = res.data.filter((thing, index, self) =>
        index === self.findIndex((t) => (
          t.title === thing.title && t.sender === sessionStorage.user_id



        ))

      )

      getSend(messagefilter);

    }

    )
  }

  const getReceives = async () => {
    await axios.get('/note/receive/' + sessionStorage.user_id).then((res) => {
      const messagefilter = res.data.filter((thing, index, self) =>
        index === self.findIndex((t) => (
          t.title === thing.title && t.receiver === sessionStorage.user_id



        )
        )
      )
      getReceive(messagefilter)
    }
    )


  }


  const getAllmessages = () => {
    if (send.length > 1) {
      const messagefilter = send.filter((x) => {
        {
          return receive.some(function (y) {
            return x.title !== y.title;
          })
        }
      })
      setSend(messagefilter)

    } else {
      setSend(send)
    }

    

    if (receive.length > 1) {
      const receivefilter = receive.filter((x) => {
        {
          return send.some(function (y) {
            return x.title !== y.title;
          })
        }
      })

      setReceive(receivefilter)


    } else {
      setReceive(mreceive)
    }
    setAllmessage([...msend, ...mreceive])
    

  }




  useEffect(() => {
    getSends();
    getReceives();
    getAllmessages();

  }, [])



  return (
    <div className={styles.root}>
      <div className={styles.menugrid}><Mymenubar /></div>
      <div className={styles.content}>
        <Title />
        <div className={styles.messagetab}>
          <div className={styles.mymessage}>쪽지내역</div>
          <div className={styles.line}></div>

        </div>


        {allmessage.length !== 0 ? allmessage.map((item) => {
          if (item.sender === sessionStorage.user_id) {
            return <Message key={item.id} counter={item.receiver} itemtitle={item.title} />
          }
          else {
            return <Message key={item.id} counter={item.sender} itemtitle={item.title} />

          }


        }) : <div className={styles.messagenotice}>아직 주고 받은 쪽지가 없습니다.</div>

        }
      </div>
    </div>
  );


}




export default Messagepage;