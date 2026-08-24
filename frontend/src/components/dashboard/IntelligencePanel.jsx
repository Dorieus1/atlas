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

  const [taskMessage, setTaskMessage] = useState({ text: "", type: "" });




  useEffect(()=>{


    const loadIntelligence = async()=>{


      try {


        const data = await getIntelligence();


        setRecommendations(
          data.recommendations || []
        );


      } catch(error) {


        console.error(
          "INTELLIGENCE ERROR:",
          error
        );


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


    } finally {


      setLoading(false);


    }


  };






  return (

    <div className="
      bg-slate-800
      rounded-xl
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



      {recommendations.map((item,index)=>(


        <div

          key={index}

          className="
            bg-slate-900
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
            gap-3
            mt-5
          ">


            <button
              onClick={() =>
                createTaskHandler(item)
              }
              className="
                bg-purple-600
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
                bg-blue-600
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
                bg-green-600
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
          bg-slate-900
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
                bg-slate-800
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