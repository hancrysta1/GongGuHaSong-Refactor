import React from 'react';
import styles from '../css/App.module.css';
import Menubar from '../components/Menubar';
import Cart from '../components/Cart';
import Title from '../components/Title';
import Login from '../components/Login';

function Cartpage() {
    return (
        <div className={styles.root}>
            <div className={styles.menugrid}><Menubar /></div>
            <div className={styles.content}>
                <Title />
                {sessionStorage.length !== 0 ? <Cart /> :
                    <div>{alert("로그인이 필요합니다.")}
                        <Login /></div>}
            </div>
        </div>
    );
}

export default Cartpage;
