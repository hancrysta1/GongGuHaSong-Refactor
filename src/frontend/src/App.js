import Home from "./routes/Home.js";
import Order from "./routes/Order.js"
import Wish from "./routes/Wish.js"
import Messagepage from "./routes/Message.js";
import Quantityinfo from "./routes/Quantityinfo.js";
import Privacycheck from "./routes/Privacycheck";
import Quantitypage from "./routes/Quantitypage.js";
import Sale from "./routes/Sale.js"
import Clothes from "./routes/Clothes.js";
import Badge from "./routes/Badge.js";
import Pouch from "./routes/Pouch.js";
import Mungu from "./routes/Mungu.js";
import Etc from "./routes/Etc.js";
import Productpage from "./routes/Product.js";
import Gongguapplypage from "./routes/Gongguapply.js";
import Newgonggupage from "./routes/Newgonggu.js";
import Checkpage from "./routes/Checkpage.js";
import Loginpage from "./routes/Login.js";
import Joinpage from "./routes/Join.js";

import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
} from "react-router-dom";

import { useState } from "react";
import { useEffect } from "react";
import axios from "axios";



function App() {
  const [product, getProduct] = useState([]);
   const getProducts = async() => {
     const products = await axios.get('/sell/all').then((res) => res.data);
      products.sort((a, b) => new Date(a.finishDate) - new Date(b.finishDate))
     getProduct(products);
   }

 
   const [order, getOrder] = useState([]);

   const getOrders = async() => {
     const orders = await axios.get('/order/all').then((res) => res.data)
      
     getOrder(orders)
   }



   //로그인 상태관리
   const [isLogin, setIsLogin] = useState(false)
 
   useEffect(() => {
     getProducts();
     getOrders();

   }, [])

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home product={product}/>} />
        <Route path="/order" element={<Order product={product} orders={order}/>} />
        <Route path="/sale" element={<Sale product={product}/>} />
        <Route path="/wish" element={<Wish product={product}/>} />
        <Route path="/message" element={<Messagepage />} />
        <Route path="/quantityinfo" element={<Quantityinfo product={product}/>}/>
        <Route path="/privacy" element={<Privacycheck />} />
        <Route path="/quantity/:quantityid" element={<Quantitypage product={product}/>} />

        <Route path="/product/:sellid" element={<Productpage product={product}/>} />
        <Route path="/clothes" element={<Clothes product={product}/>} />
        <Route path="/badge" element={<Badge product={product}/>} />
        <Route path="/pouch" element={<Pouch product={product}/>} />
        <Route path="/mungu" element={<Mungu product={product}/>} />
        <Route path="/etc" element={<Etc product={product}/>} />

        <Route path="/gongguapply/:applyid" element={<Gongguapplypage product={product}/>} />
        <Route path="/newgonggu" element={<Newgonggupage />} />
        <Route path="/check/:checkid" element={<Checkpage product={product}/>} />
        <Route path="/login" element={<Loginpage />} />
        <Route path="/join" element={<Joinpage />} />

      </Routes>
    </Router>

  );
}

export default App;
