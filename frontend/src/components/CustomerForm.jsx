import { useState } from "react";
import { createCustomer } from "../api/atlasApi";


function CustomerForm({ onCustomerCreated }) {


  const [name, setName] = useState("");

  const [email, setEmail] = useState("");

  const [phone, setPhone] = useState("");

  const [error, setError] = useState("");



  const submit = async () => {


    if (!name.trim()) {

      setError("Customer name is required.");

      return;

    }

    setError("");


    try {


      const data = await createCustomer(

        name.trim(),

        email.trim(),

        phone.trim()

      );


      setName("");

      setEmail("");

      setPhone("");


      if(onCustomerCreated){

        onCustomerCreated(data);

      }


    } catch(err) {


      console.error(err);

      setError("Failed to create customer. Please try again.");


    }


  };




  return (

    <div className="
      bg-slate-900
      rounded-xl
      p-6
      mt-6
    ">


      <h2 className="text-xl font-bold">

        Add Customer

      </h2>


      {error && (

        <p className="text-red-400 mb-3">

          {error}

        </p>

      )}


     <input
  placeholder="Customer name"
  value={name}
  onChange={(e) => setName(e.target.value)}
  className="w-full bg-slate-900 text-white placeholder:text-slate-500 border border-slate-700 rounded-lg p-3 mb-3"
/>

<input
  placeholder="Customer email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  className="w-full bg-slate-900 text-white placeholder:text-slate-500 border border-slate-700 rounded-lg p-3 mb-3"
/>

<input
  placeholder="Customer phone"
  value={phone}
  onChange={(e) => setPhone(e.target.value)}
  className="w-full bg-slate-900 text-white placeholder:text-slate-500 border border-slate-700 rounded-lg p-3"
/>

      <button

        className="
          mt-4
          bg-blue-600
          px-5
          py-2
          rounded-lg
        "

        onClick={submit}

      >

        Create Customer

      </button>



    </div>

  );

}


export default CustomerForm;