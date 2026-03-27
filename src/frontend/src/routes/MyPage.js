import React from 'react';
import styles from '../css/App.module.css';
import Menubar from '../components/Menubar';
import MyPage from '../components/MyPage';
import Title from '../components/Title';
import Login from '../components/Login';
import RealTimeRanking from '../components/RealTimeRanking';

function MyPageRoute() {
    return (
        <div className={styles.root}>
            <div className={styles.menugrid}><Menubar /></div>
            <div className={styles.content}>
                <Title />
                {sessionStorage.length !== 0 ? <MyPage /> :
                    <div>{alert("로그인이 필요합니다.")}
                        <Login /></div>}
                <div style={{ padding: '20px', background: '#FFF4E8' }}>
                    <RealTimeRanking />
                </div>
            </div>
        </div>
    );
}

export default MyPageRoute;
