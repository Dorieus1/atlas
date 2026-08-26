import { useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Brain } from "lucide-react";
import { API_BASE } from "../api/atlasApi";
import Logo from "../components/Logo";


function KnowledgeSetup() {


  const navigate = useNavigate();

  const savingRef = useRef(false);


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

    if (savingRef.current) {

      return;

    }

    savingRef.current = true;

    setError("");

    setSaving(true);


    try {


      const token = localStorage.getItem("token");

      for (const item of entries){


        const res = await fetch(

          `${API_BASE}/api/knowledge`,

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



      navigate("/dashboard");


    } catch (err) {

      setError(err.message);

    } finally {

      savingRef.current = false;

      setSaving(false);

    }


  };






  return (

    <div className="
      max-w-xl
      mx-auto
      mt-12
      mb-12
      rounded-2xl
      border
      border-ink-700
      bg-ink-900/60
      p-8
    ">

      <Logo size={34} className="mb-6" />

      <h1 className="
        text-3xl
        font-bold
        mb-6
        flex
        items-center
        gap-2
      ">

        <Brain size={28} />
        Teach Atlas Your Business

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
          bg-ink-800
          border
          border-ink-700
          rounded-lg
          p-3
          text-white
          placeholder:text-slate-500
          focus:outline-none
          focus:border-ink-600
        "

      />




      <textarea

        name="services"

        placeholder="Services you offer"

        onChange={update}

        className="
          w-full
          mb-4
          bg-ink-800
          border
          border-ink-700
          rounded-lg
          p-3
          text-white
          placeholder:text-slate-500
          focus:outline-none
          focus:border-ink-600
        "

      />




      <textarea

        name="serviceArea"

        placeholder="Areas you serve"

        onChange={update}

        className="
          w-full
          mb-4
          bg-ink-800
          border
          border-ink-700
          rounded-lg
          p-3
          text-white
          placeholder:text-slate-500
          focus:outline-none
          focus:border-ink-600
        "

      />




      <textarea

        name="faq"

        placeholder="Common customer questions"

        onChange={update}

        className="
          w-full
          mb-4
          bg-ink-800
          border
          border-ink-700
          rounded-lg
          p-3
          text-white
          placeholder:text-slate-500
          focus:outline-none
          focus:border-ink-600
        "

      />




      <button

        onClick={saveKnowledge}

        disabled={saving}

        className="
          bg-brand-600
          hover:bg-brand-500
          px-6
          py-3
          rounded-lg
          cursor-pointer
          font-semibold
          text-white
          transition
          disabled:opacity-50
        "

      >

        {saving ? "Saving..." : "Train Atlas"}

      </button>


      <p className="mt-6 text-slate-400">

        <Link to="/dashboard" className="text-brand-400 hover:underline">

          Skip for now
        </Link>

      </p>



    </div>

  );


}


export default KnowledgeSetup;