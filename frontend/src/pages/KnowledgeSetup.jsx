import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";


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

  const [error, setError] = useState("");

  const [saving, setSaving] = useState(false);





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
        content:knowledge.hours.trim()
      },

      {
        title:"Services",
        content:knowledge.services.trim()
      },

      {
        title:"Service Area",
        content:knowledge.serviceArea.trim()
      },

      {
        title:"FAQ",
        content:knowledge.faq.trim()
      }

    ].filter((item)=>item.content);


    if (entries.length === 0) {

      setError("Fill in at least one field before saving.");

      return;

    }

    setError("");

    setSaving(true);


    try {


      const token = localStorage.getItem("token");

      for (const item of entries){


        const res = await fetch(

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


        if (!res.ok) {

          throw new Error("Failed to save " + item.title);

        }


      }



      navigate("/");


    } catch (err) {

      setError(err.message);

    } finally {

      setSaving(false);

    }


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


      {error && (

        <p className="text-red-400 mb-4">

          {error}

        </p>

      )}


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

        disabled={saving}

        className="
          bg-blue-600
          px-6
          py-3
          rounded-lg
          cursor-pointer
          disabled:opacity-50
        "

      >

        {saving ? "Saving..." : "Train Atlas"}

      </button>


      <p className="mt-6 text-slate-400">

        <Link to="/" className="text-blue-400 hover:underline">

          Skip for now
        </Link>

      </p>



    </div>

  );


}


export default KnowledgeSetup;