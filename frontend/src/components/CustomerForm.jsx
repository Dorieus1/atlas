import { useState } from "react";
import { createCustomer } from "../api/atlasApi";


function CustomerForm({ onCustomerCreated }) {


  const [name, setName] = useState("");

  const [email, setEmail] = useState("");



  const submit = async () => {


    if (!name) {

      return;

    }


    try {


      const data = await createCustomer(

        name,

        email

      );


      setName("");

      setEmail("");


      if(onCustomerCreated){

        onCustomerCreated(data);

      }


    } catch(error) {


      console.error(error);


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