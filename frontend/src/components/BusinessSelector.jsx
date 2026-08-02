import { useEffect, useState } from "react";

function BusinessSelector({ setBusiness }) {

  const [businesses, setBusinesses] = useState([]);


  useEffect(() => {

    fetch("http://localhost:5050/api/business")
      .then((res) => res.json())
      .then((data) => {

        setBusinesses(data);

        if (data.length > 0) {
          setBusiness(data[0]);
        }

      });

  }, [setBusiness]);



  return (

    <div className="card">

      <h2>Select Business</h2>


      <select

        onChange={(e) => {

          const selected = businesses.find(
            (business) =>
              business.id === e.target.value
          );


          setBusiness(selected);

        }}

      >

        {businesses.map((business) => (

          <option
            key={business.id}
            value={business.id}
          >

            {business.name}

          </option>

        ))}

      </select>


    </div>

  );

}


export default BusinessSelector;