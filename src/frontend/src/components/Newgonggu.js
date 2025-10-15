import React, { useEffect, useState } from 'react';
import styles from '../css/Newgonggu.module.css';
import nsicon from "../image/nsicon.png";
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const Newgonggu = () => {
    const [newform, setNewform] = useState({
        title: "",
        managerId: "",
        category: "",
        price: 0,
        min_count: 0,
        info: "",
        startDate: "",
        finishDate: "",
        startResearch : "",
        finishResearch: "",
        notice: "",
        mainPhoto: "",
        sizePhoto: "",
        accountName: "",
        account: ""


    })
    const history = useNavigate();
    const [imageSrc, setImageSrc] = useState("");

    const encodeFileToBase64 = (fileBlob) => {
      if (fileBlob) {
        const reader = new FileReader();
        reader.readAsDataURL(fileBlob);
        reader.onloadend = (event) => {
          const base64data = reader.result;
          
          setNewform({...newform, mainPhoto: base64data});
        };
      } else {
        setImageSrc("");
      }
    };
    const encodeInfoToBase64 = (fileBlob) => {

        if (fileBlob) {
          const reader = new FileReader();
          reader.readAsDataURL(fileBlob);
          reader.onload = (event) => {
            const base64data = reader.result;
          
          setNewform({...newform, sizePhoto: base64data});
          };
        } else {
          setImageSrc("");
        }
      };

    const { title, managerId, category ,price, min_count, info, startDate, finishDate, startResearch, finishResearch, notice, mainPhoto, sizePhoto, accountName, account} = newform;
    
    const onChange = (e) => {
        const { value, name } = e.target; // 우선 e.target 에서 name 과 value 를 추출
        setNewform({
          ...newform, // 기존의 input 객체를 복사한 뒤
          [name]: value // name 키를 가진 값을 value 로 설정
        });
      };


      useEffect(() => {
        setNewform({...newform, managerId: sessionStorage.user_id});
      }, [])


      const handleSubmit= async(e) => {
        e.preventDefault()

        await axios({
            method: "POST",
            url: '/sell', 
            data: newform
           
          }).then((res) => {

            if (res.status === 200) {
                alert('새로운 공구가 추가되었습니다!')
              history(`/`);
            } else if (res === null){ 
                alert('중복된 제목입니다.')

            }
            else { }
          });
    
    
    
      }
  


    return (
        <div className={styles.newgonggu}>
            <div className={styles.tab}>
                <div className={styles.dname}>
                    상세정보
                </div>
                <div className={styles.line}>

                </div>
            </div>
            <div className={styles.application}>
                <div className={styles.info}>
                    <form className={styles.details} onSubmit={handleSubmit}>
                        <h2><img src={nsicon} alt="icon" style={{ width: "50px", height: "40px" }} />기본 정보</h2>

                        <ul>
                            <li><label htmlFor="공구 제목">공구 제목</label><input type="text" name="title" placeholder="20자 이내로 입력하세요" onChange={onChange}/></li>
                            <li><label htmlFor="예상 가격">예상 가격</label><input className={styles.inputcss} type="number" name="price" onChange={onChange}/>&nbsp;원</li>
                            <li><label htmlFor="최소 수량">최소 수량</label><input className={styles.inputcss} type="number" name="min_count" onChange={onChange}/>&nbsp;개</li>
                            <li>카테고리</li>
                            <li><input type="radio" name="category" id="의류" value="clothes" onChange={onChange}/>&nbsp;
                                <label htmlFor="의류">의류</label>&emsp;</li>
                            <li><input type="radio" name="category" id="뱃지" value="badge" onChange={onChange}/>&nbsp;
                                <label htmlFor="뱃지">뱃지</label>&emsp;</li>
                            <li><input type="radio" name="category" id="파우치" value="pouch" onChange={onChange}/>&nbsp;
                                <label htmlFor="파우치">파우치</label>&emsp;</li>
                            <li><input type="radio" name="category" id="문구류" value="mungu" onChange={onChange}/>&nbsp;
                                <label htmlFor="문구류">문구류</label>&emsp;</li>
                            <li><input type="radio" name="category" id="기타" value="etc" onChange={onChange}/>&nbsp;
                                <label htmlFor="기타">기타</label></li>

                        </ul>

                        <h2><img src={nsicon} alt="icon" style={{ width: "50px", height: "40px" }} />물품 사진</h2>
                        <ul>
                            <li>여기에 물품 사진을 등록하세요 &emsp;&emsp;&emsp;&emsp;&emsp;
                                <input type="file" name="mainPhoto" id="upload_file" 
                            accept="image/*" onChange={(e)=>{encodeFileToBase64(e.target.files[0]);}}/></li>
                            <li>물품 규격 및 사이즈 표 정보를 등록하세요 &emsp;
                                <input type="file" name="sizePhoto" id="upload_info_file" 
                            accept="image/*" onChange={(e)=>{encodeInfoToBase64(e.target.files[0]);}}/></li>
                        </ul>
                        <h2><img src={nsicon} alt="icon" style={{ width: "50px", height: "40px" }} /> 프로젝트 소개</h2>
                        <ul>
                            <li><textarea className={styles.textareacss} name="info" placeholder="공구할 물품에 대한 정보를 기재하세요" rows="20" cols="80" onChange={onChange}></textarea></li>
                        </ul>
                        <h2><img src={nsicon} alt="icon" style={{ width: "50px", height: "40px" }} />진행 기간</h2>
                        <ul>
                            <li>수량조사 기간&emsp;<input  className={styles.inputcss} type="date" name="startResearch" onChange={onChange}/>&nbsp;~<input type="date" name="finishResearch" onChange={onChange}/></li>
                            <li>공구진행 기간&emsp;<input  className={styles.inputcss} type="date" name="startDate" onChange={onChange}/>&nbsp;~<input type="date" name="finishDate" onChange={onChange}/></li>
                        </ul>
                        <h2><img src={nsicon} alt="icon" style={{ width: "50px", height: "40px" }} /> 유의사항</h2>
                        <ul>
                            <li><textarea className={styles.textareacss} name="notice" placeholder="환불 정보 등 공구시 유의사항을 기재하세요" rows="25" cols="80" onChange={onChange}></textarea></li>
                        </ul>
                        <ul>
                            <li><label htmlFor="계좌명">계좌이름</label><input type="text" name="accountName" placeholder="입금 받을 계좌의 이름" onChange={onChange}/></li>
                            <li><label htmlFor="입금계좌">계좌번호</label><input className={styles.inputcss} type="text" name="account" placeholder="입금 받을 계좌번호" onChange={onChange}/></li>
                        </ul>


                        <ul className={styles.buttongroup}>
                            <li><button className={styles.reset} type="reset">취소하기</button></li>
                            <li><button className={styles.submit} type="submit">등록하기</button></li>
                        </ul>
                    </form>

                </div >

            </div>

        </div>
    )
}


export default Newgonggu;