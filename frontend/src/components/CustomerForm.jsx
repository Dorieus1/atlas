import { useState } from "react";


function CustomerForm({ business, onCustomerCreated }) {

  const [name, setName] = useState("");

  const [email, setEmail] = useState("");



  const createCustomer = async () => {


    if (!business || !name) {

      return;

    }



    const response = await fetch(

      "http://localhost:5050/api/customers",

      {

        method: "POST",

        headers: {

          "Content-Type": "application/json",

        },


        body: JSON.stringify({

          business_id: business.id,

          name,

          email,

        }),


      }

    );



    const data = await response.json();



    setName("");

    setEmail("");



    if (onCustomerCreated) {

      onCustomerCreated(data);

    }


  };




  return (

    <div className="card">

      <h2>Add Customer</h2>


      <input

        placeholder="Customer name"

        value={name}

        onChange={(e) => setName(e.target.value)}

      />


      <input

        placeholder="Customer email"

        value={email}

        onChange={(e) => setEmail(e.target.value)}

      />


      <button onClick={createCustomer}>

        Create Customer

      </button>


    </div>

  );

}


export default CustomerForm;