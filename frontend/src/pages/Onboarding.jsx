import { useState } from "react";
import { useNavigate } from "react-router-dom";


function Onboarding() {


  const navigate = useNavigate();


  const [form,setForm] = useState({

    name:"",
    industry:"",
    phone:"",
    email:"",
    address:"",
    services:""

  });




  const update = (e)=>{


    setForm({

      ...form,

      [e.target.name]:
      e.target.value

    });


  };





  const submit = async()=>{


    const res =
      await fetch(

        "http://localhost:5050/api/business",

        {

          method:"POST",

          headers:{

            "Content-Type":
            "application/json"

          },

          body:
          JSON.stringify(form)

        }

      );


    const data =
      await res.json();



    localStorage.setItem(

      "business_id",

      data.id

    );


    navigate("/");


  };





  return (

    <div className="
      max-w-xl
      mx-auto
      p-8
    ">


      <h1 className="
        text-3xl
        font-bold
        mb-6
      ">

        🚀 Setup Atlas

      </h1>




      {[
        ["name","Business Name"],
        ["industry","Industry"],
        ["phone","Phone"],
        ["email","Email"],
        ["address","Address"],
        ["services","Services"]

      ].map(([name,label])=>(


        <input

          key={name}

          name={name}

          placeholder={label}

          value={form[name]}

          onChange={update}

          className="
            w-full
            mb-4
            bg-slate-800
            rounded-lg
            p-3
          "

        />


      ))}



      <button

        onClick={submit}

        className="
          bg-blue-600
          px-6
          py-3
          rounded-lg
          cursor-pointer
        "

      >

        Create Business

      </button>



    </div>

  );


}


export default Onboarding;