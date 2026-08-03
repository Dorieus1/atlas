import { useEffect, useState } from "react";


function CustomerSelector({
  business,
  customers,
  setCustomer
}) {


  const [businessCustomers, setBusinessCustomers] = useState([]);



  useEffect(() => {


    if (!business) {

      setBusinessCustomers([]);

      return;

    }



    const filtered = customers.filter(

      (customer) =>

        customer.business_id === business.id

    );



    setBusinessCustomers(filtered);



    if (filtered.length > 0) {

      setCustomer(filtered[0]);

    } else {

      setCustomer(null);

    }



  }, [business, customers, setCustomer]);





  return (

    <div className="card">


      <h2>Select Customer</h2>



      <select


        value={

          businessCustomers.length > 0

          ? businessCustomers[0].id

          : ""

        }



        onChange={(e) => {


          const selected = businessCustomers.find(

            (customer) =>

              customer.id === e.target.value

          );


          setCustomer(selected);


        }}


      >



        {businessCustomers.map((customer) => (


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