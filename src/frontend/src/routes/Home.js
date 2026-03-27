import styles from "../css/App.module.css";
import searchStyles from "../css/Search.module.css";
import Menubar from "../components/Menubar";
import Title from "../components/Title";
import Productcomponent from "../components/Productcomponent";
import SearchBar from "../components/SearchBar";
import RealTimeRanking from "../components/RealTimeRanking";
import { useState, useEffect } from "react";
import axios from "axios";

function Home({product}) {
  const [main, setMain] = useState([]);
  const [searchResults, setSearchResults] = useState(null);

  function calculateDday(item) {
    let endDay = new Date(item.finishDate)
    return endDay.getTime();
  }

  function calculatedday(item) {
    let startDay = new Date(item.startDate)
    return startDay.getTime();
  }

  const handleSearchResults = (results) => {
    setSearchResults(results);
  };

  const clearSearch = () => {
    setSearchResults(null);
  };

  useEffect(() => {
    const allProducts = [...product];
    allProducts.sort((a, b) => new Date(a.finishDate) - new Date(b.finishDate));

    const today = new Date();
    const ctoday = today.getTime();

    let mainDdayfilter = allProducts.filter((item) => {
      return (calculateDday(item) >= ctoday) && (calculatedday(item) <= ctoday);
    })

    setMain(mainDdayfilter);

  }, [product])

  // 검색 결과가 있을 때 표시할 상품 목록
  const displayProducts = searchResults !== null ? searchResults : main;

  return(
      <div className={styles.root}>
        <div className={styles.menugrid}><Menubar /></div>
        <div className={styles.content}>
          <Title />
          <SearchBar onSearchResults={handleSearchResults} products={product} />

          {searchResults !== null && (
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
              <span className={searchStyles.searchResultsTitle}>
                검색 결과 ({searchResults.length}건)
              </span>
              <button onClick={clearSearch} style={{
                marginLeft: '10px',
                padding: '5px 15px',
                border: '1px solid #0D2D84',
                borderRadius: '15px',
                background: 'transparent',
                color: '#0D2D84',
                cursor: 'pointer',
                fontFamily: 'content'
              }}>전체보기</button>
            </div>
          )}

          {displayProducts.length !== 0 ? displayProducts.map((item) =>
            <Productcomponent key={item._id || item.id}
             main={item}
            />
          ) : <div className={styles.notice}>
                {searchResults !== null ? '검색 결과가 없습니다.' : '아직 등록된 상품이 없습니다.'}
              </div>
          }
        </div>
        <div style={{ padding: '20px', background: '#FFF4E8' }}>
          <RealTimeRanking />
        </div>
      </div>
    )
}

export default Home;
