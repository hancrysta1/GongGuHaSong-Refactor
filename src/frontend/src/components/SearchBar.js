import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '../css/Search.module.css';

function SearchBar({ onSearchResults, products = [] }) {
  const [keyword, setKeyword] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // ES 결과가 비었을 때 로컬 상품에서 검색
  const localSearch = (query) => {
    const q = query.toLowerCase();
    return products.filter(item =>
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.content && item.content.toLowerCase().includes(q)) ||
      (item.category && item.category.toLowerCase().includes(q))
    );
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!keyword.trim()) return;

    try {
      const userId = sessionStorage.getItem('user_id') || '';
      const res = await fetch(`/search?keyword=${encodeURIComponent(keyword)}&userId=${userId}`);
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      if (onSearchResults) {
        // ES 결과가 비면 로컬 폴백
        onSearchResults(data.length > 0 ? data : localSearch(keyword));
      }
    } catch (error) {
      console.error('검색 실패:', error);
      // API 실패 시에도 로컬 검색
      if (onSearchResults) onSearchResults(localSearch(keyword));
    }
    setShowSuggestions(false);
  };

  const handleChange = async (e) => {
    const value = e.target.value;
    setKeyword(value);

    if (value.trim().length >= 1) {
      try {
        const res = await fetch(`/search/suggest?keyword=${encodeURIComponent(value)}`);
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setSuggestions(data.slice(0, 5));
        } else {
          // ES 결과 없으면 로컬 상품에서 자동완성
          const local = localSearch(value).map(item => ({ title: item.title }));
          setSuggestions(local.slice(0, 5));
        }
        setShowSuggestions(true);
      } catch {
        const local = localSearch(value).map(item => ({ title: item.title }));
        setSuggestions(local.slice(0, 5));
        setShowSuggestions(local.length > 0);
      }
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = async (title) => {
    setKeyword(title);
    setShowSuggestions(false);
    try {
      const userId = sessionStorage.getItem('user_id') || '';
      const res = await fetch(`/search?keyword=${encodeURIComponent(title)}&userId=${userId}`);
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      if (onSearchResults) {
        onSearchResults(data.length > 0 ? data : localSearch(title));
      }
    } catch {
      if (onSearchResults) onSearchResults(localSearch(title));
    }
  };

  return (
    <div className={styles.searchContainer}>
      <form onSubmit={handleSearch} className={styles.searchForm}>
        <input
          type="text"
          value={keyword}
          onChange={handleChange}
          placeholder="상품 검색..."
          className={styles.searchInput}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
        />
        <button type="submit" className={styles.searchButton}>검색</button>
      </form>
      {showSuggestions && suggestions.length > 0 && (
        <ul className={styles.suggestions}>
          {suggestions.map((item, idx) => (
            <li key={idx} onClick={() => handleSuggestionClick(item.title)}
                className={styles.suggestionItem}>
              {item.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SearchBar;
