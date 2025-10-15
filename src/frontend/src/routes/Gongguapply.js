import React, { useEffect } from 'react';
import styles from '../css/App.module.css';
import Menubar from '../components/Menubar';
import Gongguapply from '../components/Gongguapply';
import Title from '../components/Title';
import { useParams } from 'react-router-dom';
import Login from '../components/Login';


function Gongguapplypage({ product }) {

  let { applyid } = useParams();

  let findItem = product.find((item) => {
    return item._id == applyid;
  });

  return (
    <div className={styles.root}>
      <div className={styles.menugrid}><Menubar /></div>
      <div className={styles.content}>
        <Title />
        {sessionStorage.length !== 0 ? <Gongguapply findItem={findItem} /> :
          <div>{alert("로그인이 필요합니다.")}
            <Login /></div>}
          </div>
        </div>
      )
}

      export default Gongguapplypage;