import React from 'react';
import styles from '../css/App.module.css';
import Newgonggu from '../components/Newgonggu';
import Menubar from '../components/Menubar';
import Title from '../components/Title';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Login from "../components/Login"

const Newgonggupage = () => {
  const history = useNavigate();



    return (

      
        <div className={styles.root}>
        <div className={styles.menugrid}><Menubar /></div>
        <div className={styles.content}>
          <Title />
          {sessionStorage.length !== 0 ? <Newgonggu /> :
        <div>{alert("로그인이 필요합니다.")}
        <Login />
        </div>}
      
            
        </div>
        </div>
        
       

    
  )

  
}

export default Newgonggupage;