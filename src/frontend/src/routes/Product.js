import React from 'react';
import styles from '../css/App.module.css';
import { Link, useParams } from "react-router-dom";
import Menubar from '../components/Menubar';
import Title from '../components/Title';
import Product from '../components/Product';
import Productlead from '../components/Productlead';
import { useState, useEffect } from 'react';

const Productpage = ({product}) => {
    // const [productpage, setProductpage] = useState(false);
    // useEffect(() => {
    //     if(productpage) {       //sessionid=product.managerid
    //         setProductpage((prev) => !prev)
      
    //     } else {
    //         setProductpage((prev) => prev)
    //     }
    // }, [])
    // let {id} = useParams();
    // console.log({product})
    // return (
    //     <div className={styles.root}>
    //         <div className={styles.menugrid}><Menubar /></div>
    //         <div className={styles.content}>
    //             <Title />
    //             {productpage ? <Productlead product={product} />:<Product product={product} />}
                
    //             </div>
    //     </div>
    // )    

        // sell id 따오기
        let { sellid } = useParams();
        let findItem = product.find((item) => {
            return item._id == sellid;
        });
    return (
        <div className={styles.root}>
            <div className={styles.menugrid}><Menubar /></div>
            <div className={styles.content}>
                <Title />
                {sessionStorage.user_id === findItem.managerId  ?
                <Productlead findItem={ findItem } />:<Product findItem={ findItem } />
                
                }
                
                </div>
        </div>
    )

}

export default Productpage;