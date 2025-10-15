import React, { useState } from 'react';
import Calendar from 'react-calendar';
import '../css/Calendar.css'


function Period({startDate, finishDate}) {
 const [date, setDate] = useState([
    new Date(startDate),
    new Date(finishDate)

  ]
  );
  

  
  return (
      <div>
      <Calendar
        value={date}
        formatDay={(locale, date) =>
          date.toLocaleString("en", { day: "numeric" })
        }
        defaulalue={date}


      />
    </div>
  );
}

export default Period;

