import { useEffect, useState } from "react";


function CustomerSelector({ business, setCustomer }) {

  const [customers, setCustomers] = useState([]);



  useEffect(() => {

    if (!business) {
      return;
    }


    fetch("http://localhost:5050/api/customers")
      .then((res) => res.json())
      .then((data) => {

        const businessCustomers = data.filter(

          (customer) =>

            customer.business_id === business.id

        );


        setCustomers(businessCustomers);


        if (businessCustomers.length > 0) {

          setCustomer(businessCustomers[0]);

        }


      });


  }, [business, setCustomer]);




  return (

    <div className="card">

      <h2>Select Customer</h2>


      <select

        onChange={(e) => {

          const selected = customers.find(

            (customer) =>

              customer.id === e.target.value

          );


          setCustomer(selected);


        }}

      >


        {customers.map((customer) => (

          <option

            key={customer.id}

            value={customer.id}

          >

            {customer.name || customer.email || "Unnamed Customer"}

          </option>

        ))}


      </select>


    </div>

  );


}


export default CustomerSelector;