import React from 'react';
import styles from '../css/App.module.css';
import { useParams } from "react-router-dom";
import Menubar from '../components/Menubar';
import Title from '../components/Title';
import Product from '../components/Product';
import Productlead from '../components/Productlead';

const Productpage = ({product}) => {
        let { sellid } = useParams();
        let findItem = product.find((item) => {
            return item._id == sellid;
        });
    return (
        <div className={styles.root}>
            <div className={styles.menugrid}><Menubar /></div>
            <div className={styles.content}>
                <Title />
                {!findItem ? <div style={{padding: '40px', textAlign: 'center'}}>상품을 찾을 수 없습니다.</div> :
                 sessionStorage.user_id === findItem.managerId ?
                <Productlead findItem={ findItem } />:<Product findItem={ findItem } />
                }
                </div>
        </div>
    )
}

export default Productpage;