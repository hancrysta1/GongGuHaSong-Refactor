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
import Editgonggupage from "./routes/Editgonggu.js";
import Checkpage from "./routes/Checkpage.js";
import Loginpage from "./routes/Login.js";
import Joinpage from "./routes/Join.js";
import Cartpage from "./routes/Cart.js";
import MyPageRoute from "./routes/MyPage.js";
import OrderNotification from "./components/OrderNotification.js";

import {
  BrowserRouter as Router,
  Routes,
  Route,
} from "react-router-dom";

import { useState } from "react";
import { useEffect } from "react";
import axios from "axios";

const TEST_PRODUCTS = [
  {
    _id: 'test1',
    title: '버니 키링 공구',
    price: 4500,
    mainPhoto: 'https://placehold.co/300x300/FFB6C1/333333?text=Bunnies+Keyring',
    startDate: '2026-03-01',
    finishDate: '2026-04-01',
    min_count: 30,
    stock: 200,
    category: '기타',
    info: '버니 아크릴 키링 공동구매입니다. 고급 아크릴 소재로 제작되며, 양면 인쇄됩니다.',
    content: '버니 아크릴 키링 공동구매입니다.',
    notice: '배송은 공구 마감 후 2주 이내 진행됩니다.',
    writer: 'bunny_lover',
    managerId: 'bunny_lover'
  },
  {
    _id: 'test2',
    title: '과잠 맞춤 제작 (컴공 24학번)',
    price: 35000,
    mainPhoto: 'https://placehold.co/300x300/1E3A5F/ffffff?text=CS+24+Jacket',
    startDate: '2026-03-10',
    finishDate: '2026-04-15',
    min_count: 40,
    stock: 150,
    category: '의류',
    info: '컴퓨터공학과 24학번 과잠 공동구매. 자수 로고, 학번 각인 포함.',
    content: '컴퓨터공학과 24학번 과잠 공동구매',
    notice: '사이즈 교환은 수령 후 3일 이내 가능합니다.',
    writer: 'cs_student',
    managerId: 'cs_student'
  },
  {
    _id: 'test3',
    title: '스터디 플래너 노트 (6개월용)',
    price: 8900,
    mainPhoto: 'https://placehold.co/300x300/87CEEB/333333?text=Study+Planner',
    startDate: '2026-03-05',
    finishDate: '2026-04-20',
    min_count: 50,
    stock: 300,
    category: '문구류',
    info: '6개월 스터디 플래너 공동구매. 커스텀 커버 선택 가능, 180페이지 구성.',
    content: '6개월 스터디 플래너 공동구매, 커스텀 커버 가능',
    notice: '커버 디자인은 공구 마감 후 투표로 결정됩니다.',
    writer: 'planner_queen',
    managerId: 'planner_queen'
  }
];

function App() {
  const [product, getProduct] = useState([]);
   const getProducts = async() => {
     const products = await axios.get('/sell/all').then((res) => res.data);
     if (Array.isArray(products) && products.length > 0) {
       products.sort((a, b) => new Date(a.finishDate) - new Date(b.finishDate));
       getProduct(products);
     } else {
       getProduct(TEST_PRODUCTS);
     }
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
      <OrderNotification />
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
        <Route path="/editgonggu/:id" element={<Editgonggupage />} />
        <Route path="/check/:checkid" element={<Checkpage product={product}/>} />
        <Route path="/login" element={<Loginpage />} />
        <Route path="/join" element={<Joinpage />} />
        <Route path="/cart" element={<Cartpage />} />
        <Route path="/mypage" element={<MyPageRoute />} />

      </Routes>
    </Router>

  );
}

export default App;
