import { useEffect, useState } from "react";
import {
  getIntelligence,
  createTask,
  generateMessage
} from "../../api/atlasApi";


function IntelligencePanel() {


  const [recommendations, setRecommendations] = useState([]);

  const [generatedMessage, setGeneratedMessage] = useState("");

  const [messageType, setMessageType] = useState("");

  const [loading, setLoading] = useState(false);

  const [loadingIntelligence, setLoadingIntelligence] = useState(true);

  const [loadError, setLoadError] = useState("");

  const [taskMessage, setTaskMessage] = useState({ text: "", type: "" });

  const [messageError, setMessageError] = useState("");




  useEffect(()=>{


    const loadIntelligence = async()=>{


      try {


        const data = await getIntelligence();


        setRecommendations(
          data.recommendations || []
        );

        setLoadError("");


      } catch(error) {


        console.error(
          "INTELLIGENCE ERROR:",
          error
        );

        setLoadError(
          "Couldn't load your recommendations. Please refresh to try again."
        );


      } finally {

        setLoadingIntelligence(false);

      }


    };


    loadIntelligence();


  },[]);






  const createTaskHandler = async(item)=>{


    try {


      await createTask(

        item.customer_id,

        "Follow up with " + item.customer,

        item.action,

        new Date().toISOString()

      );


      setTaskMessage({
        text: "Follow-up task created for " + item.customer + ".",
        type: "success"
      });


    } catch(error) {


      console.error(error);

      setTaskMessage({
        text: "Couldn't create that follow-up task. Please try again.",
        type: "error"
      });


    }


  };






  const generateMessageHandler = async(
    customer,
    interest,
    type
  )=>{


    try {


      setLoading(true);

      setMessageType(type);

      setMessageError("");

      setGeneratedMessage("");



      const data = await generateMessage(

        customer,

        interest,

        type

      );



      setGeneratedMessage(
        data.message || ""
      );



    } catch(error) {


      console.error(error);

      setMessageError("Couldn't generate that message. Please try again.");


    } finally {


      setLoading(false);


    }


  };






  return (

    <div className="
      h-full
      rounded-2xl
      border
      border-ink-700
      bg-ink-900/60
      p-6
    ">


      <h2 className="
        text-2xl
        font-bold
        mb-6
      ">

        🧠 Atlas Intelligence

      </h2>


      {taskMessage.text && (

        <p className={
          "mb-4 " +
          (taskMessage.type === "error" ? "text-red-400" : "text-green-400")
        }>

          {taskMessage.text}

        </p>

      )}


      {loadingIntelligence ? (

        <p className="text-slate-400">
          Loading recommendations...
        </p>

      ) : loadError ? (

        <p className="text-red-400">
          {loadError}
        </p>

      ) : recommendations.length === 0 ? (

        <p className="text-slate-400">
          Nothing needs your attention right now.
        </p>

      ) : null}



      {recommendations.map((item,index)=>(


        <div

          key={index}

          className="
            bg-ink-800
            border
            border-ink-700
            rounded-xl
            p-5
            mb-5
          "

        >


          <h3 className="
            text-xl
            font-bold
          ">

            👤 {item.customer}

          </h3>



          <p>
            🔥 Priority: {item.priority}
          </p>


          <p>
            📌 Status: {item.status}
          </p>



          <p className="mt-3 text-slate-300">

            <b>
              Situation:
            </b>

            {" "}

            {item.reason}

          </p>



          <p className="mt-2 text-green-400">

            <b>
              Recommended Action:
            </b>

            {" "}

            {item.action}

          </p>




          <div className="
            flex
            flex-wrap
            gap-3
            mt-5
          ">


            <button
              onClick={() =>
                createTaskHandler(item)
              }
              className="
                bg-brand-600
                hover:bg-brand-500
                transition
                px-4
                py-2
                rounded-lg
              "
            >

              📅 Create Follow-Up

            </button>



            <button
              onClick={() =>
                generateMessageHandler(
                  item.customer,
                  item.interest,
                  "SMS"
                )
              }
              className="
                bg-brand-600
                hover:bg-brand-500
                transition
                px-4
                py-2
                rounded-lg
              "
            >

              📱 SMS

            </button>



            <button
              onClick={() =>
                generateMessageHandler(
                  item.customer,
                  item.interest,
                  "Email"
                )
              }
              className="
                bg-brand-600
                hover:bg-brand-500
                transition
                px-4
                py-2
                rounded-lg
              "
            >

              ✉️ Email

            </button>


          </div>


        </div>


      ))}



      {messageType && (

        <div className="
          bg-ink-800
          border
          border-ink-700
          rounded-xl
          p-5
        ">


          <h3 className="font-bold">

            Generated {messageType}

          </h3>


          {loading ? (

            <p>
              Atlas is writing...
            </p>

          ) : messageError ? (

            <p className="mt-3 text-red-400">
              {messageError}
            </p>

          ) : (

            <textarea

              value={generatedMessage}

              onChange={(e)=>
                setGeneratedMessage(
                  e.target.value
                )
              }

              className="
                w-full
                mt-3
                h-40
                bg-ink-900
                border
                border-ink-700
                rounded-lg
                p-3
              "

            />

          )}


        </div>

      )}



    </div>

  );


}


export default IntelligencePanel;