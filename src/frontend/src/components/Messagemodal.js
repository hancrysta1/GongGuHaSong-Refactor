import React, { useEffect, useState } from 'react';
import styles from '../css/Modal.module.css';
import Modal from 'react-modal'
import axios from 'axios';

const Messagemodal = (props) => {
  // 열기, 닫기, 모달 헤더 텍스트를 부모로부터 받아옴
  const { open, close, counter, itemtitle } = props;
  const [send, getSend] = useState([]);
  const [receive, getReceive] = useState([]);
  const [allmessage, setAllmessage] = useState([]);
  const [ordermessage, setOrdermessage] = useState([])
  const [message, getMessage] = useState({
    sender:sessionStorage.user_id,
    receiver: counter,
    comment: '',
    title: itemtitle
});

const {sender, receiver, comment, title} = message
  const onChange = (e) => {
    const { value, name } = e.target; // 우선 e.target 에서 name 과 value 를 추출
    getMessage({
      ...message, // 기존의 input 객체를 복사한 뒤
      [name]: value // name 키를 가진 값을 value 로 설정
    });
  };

  const handleSubmit= async(e) => {
    e.preventDefault()
     await axios({
         method: "POST",
         url: '/note', 
         data: message
     
       }).then((res) => {


        if (res.status === 200) {
             alert('쪽지가 전송되었습니다.')
         } else if (res === null){ 
             alert('실패하였습니다.')
         }
         else { }
       });



  }

  //내가 보내는거(로그인 되어있는 사람이 sender)
  const getSends = async() => {
    await axios.get('/note/send/' + sessionStorage.user_id).then((res) => {
      const messagefilter = res.data.filter((item) => {
        return item.title === itemtitle
      })

      getSend(messagefilter)

      
    
    })

    
  }

  //내가 받은거(counter가 보낸거)
  const getReceives = async() => {
    await axios.get('/note/send/' + counter).then((res) => {
      
      const messagefilter = res.data.filter((item) => {
        return item.title === itemtitle
      })
      getReceive(messagefilter)

    })

    

  }


const getAllmessages = () => {
  
  setAllmessage([...send, ...receive])
  allmessage.sort((a, b) => new Date(a.time) - new Date(b.time))
  setOrdermessage(allmessage)
}



  useEffect(() => {
    
    getSends();
    getReceives();
    getAllmessages();

  },[])

  return (

    
    <div className={open ? styles.openModal : styles.modal}>
  
     {open ? (
       <section className={styles.section}>
         <header className={styles.header}>
           <p className={styles.counter}>{counter}</p>
           <button className={styles.close} onClick={close}>
             close
           </button>

         </header>
         <main className={styles.main}>
          
        
         {ordermessage.map((item) => {
          if (item.sender !== counter) {
            return <Send send={item}/>

          }else {
            return <Receive receive={item}/>

          }
         }

             
            )} 




         </main>
         <footer className={styles.footer}>
          <form onSubmit={handleSubmit}>
          <textarea className={styles.textbox} name="comment" onChange={onChange}></textarea>
          <button className={styles.send} type="submit">쪽지<br/>보내기</button>

          </form>
         </footer>
       </section>
     ) : null}

   </div>


    // 모달이 열릴때 openModal 클래스가 생성된다.
  );
};

const Send = ({send}) => {

  return (
    <div className={styles.sender}>
        {send.comment}
    </div>
  
  )
}

const Receive = ({receive}) => {
  return (
    <div className={styles.receiver}>
        {receive.comment}
    </div>
  )
}

export default Messagemodal