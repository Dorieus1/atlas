import { useState } from "react";
import { useNavigate } from "react-router-dom";


function KnowledgeSetup() {


  const navigate = useNavigate();


  const business_id =
    localStorage.getItem("business_id");



  const [knowledge,setKnowledge] = useState({

    hours:"",
    services:"",
    serviceArea:"",
    faq:""

  });





  const update = (e)=>{


    setKnowledge({

      ...knowledge,

      [e.target.name]:
      e.target.value

    });


  };





  const saveKnowledge = async()=>{


    const entries = [

      {
        title:"Hours",
        content:knowledge.hours
      },

      {
        title:"Services",
        content:knowledge.services
      },

      {
        title:"Service Area",
        content:knowledge.serviceArea
      },

      {
        title:"FAQ",
        content:knowledge.faq
      }

    ];




    for (const item of entries){


      if(!item.content.trim()) continue;



      const token = localStorage.getItem("token");

      await fetch(

        "http://localhost:5050/api/knowledge",

        {

          method:"POST",

          headers:{

            "Content-Type":
            "application/json",

            ...(token
              ? { Authorization: `Bearer ${token}` }
              : {})

          },

          body:JSON.stringify({

            business_id,

            title:item.title,

            content:item.content

          })

        }

      );


    }



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

        🧠 Teach Atlas Your Business

      </h1>




      <textarea

        name="hours"

        placeholder="Business hours"

        onChange={update}

        className="
          w-full
          mb-4
          bg-slate-800
          rounded-lg
          p-3
        "

      />




      <textarea

        name="services"

        placeholder="Services you offer"

        onChange={update}

        className="
          w-full
          mb-4
          bg-slate-800
          rounded-lg
          p-3
        "

      />




      <textarea

        name="serviceArea"

        placeholder="Areas you serve"

        onChange={update}

        className="
          w-full
          mb-4
          bg-slate-800
          rounded-lg
          p-3
        "

      />




      <textarea

        name="faq"

        placeholder="Common customer questions"

        onChange={update}

        className="
          w-full
          mb-4
          bg-slate-800
          rounded-lg
          p-3
        "

      />




      <button

        onClick={saveKnowledge}

        className="
          bg-blue-600
          px-6
          py-3
          rounded-lg
          cursor-pointer
        "

      >

        Train Atlas

      </button>



    </div>

  );


}


export default KnowledgeSetup;