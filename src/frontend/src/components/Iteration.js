import React, { useState } from 'react';

const Iteration = () => {
    const [sizes, setSizes] = useState([
        { id: 1, name: 'L: 2' },
        { id: 2, name: 'M: 1' }
    ]);
    const [inputText, setInputText] = useState('');
    const [nextId, setNextId] = useState(3);


    const handleChange = e => setInputText(e.target.value);
    const handleClick = () => {
        const newList = sizes.concat({
            id: nextId,
            name: inputText
        });
        setNextId(nextId + 1);
        setSizes(newList);
        setInputText('');
    }

    const handleDelete = id => {
        const newList = sizes.filter(size => size.id !== id);
        setSizes(newList);
    };

    const sizeList = sizes.map((size) =>
        <div key={size.id}>
            <li><button onClick={() => handleDelete(size.id)}>삭제</button> {size.name}</li>
        </div>
    );

    return (
        <>
            사이즈&nbsp;&emsp; <input
                value={inputText}
                onChange={handleChange}
                placeholder="사이즈: 수량 입력"
            />
            <button onClick={handleClick}>추가</button>
            <ul>{sizeList}</ul>
        </>
    );
}

export default Iteration;