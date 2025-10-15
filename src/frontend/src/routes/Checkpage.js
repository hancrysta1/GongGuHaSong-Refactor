import React, { useEffect, useState } from 'react';
import styles from '../css/App.module.css';
import Menubar from '../components/Menubar';
import Check from '../components/Check';
import Title from '../components/Title';
import { useParams } from 'react-router-dom';
import axios from "axios";



const Checkpage = ({product}) => {
    const [check, getCheck] = useState([]);
    let { checkid } = useParams();
    let findItem = product.find((item) => {
    
        return item._id == checkid;
    });

    const getChecks = async() => {
        await axios.get('/order/', {params: {title: findItem.title}})
        .then((res) => getCheck(res.data));
        
     
      }


      

    useEffect(() => {
        
        getChecks();
    }, [])






return (
    <div className={styles.root}>
        <div className={styles.menugrid}><Menubar /></div>
        <div className={styles.content}>
            <Title />
            <Check check={check} findItem={findItem}/>

        </div>

    </div>
)
}

export default Checkpage;