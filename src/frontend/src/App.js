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
    title: '아이패드 프로 M4 공구',
    price: 1290000,
    mainPhoto: 'https://img.danawa.com/prod_img/500000/475/645/img/49645475_1.jpg?shrink=500:500',
    startDate: '2026-03-01',
    finishDate: '2026-04-15',
    min_count: 50,
    stock: 200,
    category: '전자기기',
    info: '아이패드 프로 M4 11인치 256GB 공동구매. 애플 공식 리퍼 제품, 정품 보증 1년.',
    content: '아이패드 프로 M4 공동구매',
    notice: '개봉 후 반품 불가. 초기 불량은 애플 서비스센터 이용.',
    writer: 'tech_deal',
    managerId: 'tech_deal'
  },
  {
    _id: 'test2',
    title: '오설록 제주 말차 세트',
    price: 28000,
    mainPhoto: 'https://image.osulloc.com/upload/kr/ko/adminImage/CJ/NR/20250811115829688SE.png',
    startDate: '2026-03-10',
    finishDate: '2026-04-10',
    min_count: 100,
    stock: 500,
    category: '식품',
    info: '오설록 제주 유기농 말차 파우더 + 다기 세트. 산지 직송, 26년 봄 첫물.',
    content: '오설록 제주 말차 세트 공동구매',
    notice: '유통기한 제조일로부터 12개월. 냉장 보관 권장.',
    writer: 'tea_master',
    managerId: 'tea_master'
  },
  {
    _id: 'test3',
    title: '다이슨 에어랩 멀티 스타일러',
    price: 498000,
    mainPhoto: 'https://img.danawa.com/prod_img/500000/426/603/img/89603426_1.jpg?shrink=500:500',
    startDate: '2026-03-05',
    finishDate: '2026-04-20',
    min_count: 30,
    stock: 100,
    category: '가전',
    info: '다이슨 에어랩 멀티 스타일러 컴플리트 롱. 공식 수입, 정품 2년 보증.',
    content: '다이슨 에어랩 공동구매',
    notice: '박스 개봉 후 교환/반품 불가.',
    writer: 'beauty_hub',
    managerId: 'beauty_hub'
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
