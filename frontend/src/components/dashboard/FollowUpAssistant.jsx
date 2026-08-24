import { useEffect, useState } from "react";
import {
  getLeads,
  generateFollowUpMessage
} from "../../api/atlasApi";


function FollowUpAssistant() {


  const [lead, setLead] = useState(null);

  const [message, setMessage] = useState("");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [loadError, setLoadError] = useState("");



  useEffect(()=>{


    const loadLead = async()=>{


      try {


        const data = await getLeads();


        if(data.length){

          setLead(data[0]);

        }

        setLoadError("");


      } catch(err) {


        console.error(
          "LEAD FETCH ERROR:",
          err
        );

        setLoadError(
          "Couldn't load your leads. Please refresh to try again."
        );


      }


    };


    loadLead();


  },[]);




  const generateMessage = async()=>{


    try {


      setLoading(true);

      setError("");



      const data =
        await generateFollowUpMessage(

          lead.name,

          lead.interest

        );



      setMessage(
        data.message || ""
      );



    } catch(error) {


      console.error(
        "FOLLOW UP ERROR:",
        error
      );


      setError(
        "Couldn't generate a follow-up message. Please try again."
      );


    } finally {


      setLoading(false);


    }


  };





  if(!lead){

    if (loadError) {

      return (

        <div className="
          bg-ink-900/60
          border
          border-ink-700
          rounded-2xl
          p-6
          mt-8
        ">

          <h2 className="text-xl font-bold">
            🧠 AI Follow-Up Assistant
          </h2>

          <p className="mt-3 text-red-400">
            {loadError}
          </p>

        </div>

      );

    }

    return null;

  }





  return (

    <div className="
      bg-ink-900/60
      border
      border-ink-700
      rounded-2xl
      p-6
      mt-8
    ">


      <h2 className="
        text-xl
        font-bold
      ">

        🧠 AI Follow-Up Assistant

      </h2>




      <div className="mt-5">


        <h3 className="text-lg font-bold">

          {lead.name || "Unknown Customer"}

        </h3>



        <p className="text-slate-400">

          {lead.email}

        </p>



        <p className="mt-4">

          Status: {lead.status}

        </p>


        <p>

          Priority: {lead.priority}

        </p>


        <p>

          Request: {lead.interest}

        </p>





        <button

          onClick={generateMessage}

          disabled={loading}

          className="
            mt-5
            bg-brand-600
            hover:bg-brand-500
            px-5
            py-2
            rounded-xl
          "

        >

          {loading
            ? "Generating..."
            : "Generate Follow-Up Message"
          }


        </button>


        {error && (

          <p className="mt-3 text-red-400">

            {error}

          </p>

        )}



        {message && (

          <div className="
            mt-5
            bg-ink-800
            rounded-xl
            p-4
            whitespace-pre-wrap
          ">

            {message}

          </div>

        )}



      </div>


    </div>

  );


}


export default FollowUpAssistant;