import { useEffect, useState } from "react";
import { Brain, User, Flame, Pin, CalendarCheck, Smartphone, Mail } from "lucide-react";
import {
  getIntelligence,
  createTask,
  generateMessage
} from "../../api/atlasApi";
import Skeleton, { SkeletonText } from "../Skeleton";


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
      border-border
      bg-surface/60
      p-6
    ">


      <h2 className="
        text-2xl
        font-bold
        mb-6
        flex
        items-center
        gap-2
      ">

        <Brain size={24} />
        Atlas Intelligence

      </h2>


      {taskMessage.text && (

        <p className={
          "mb-4 " +
          (taskMessage.type === "error" ? "text-danger" : "text-success")
        }>

          {taskMessage.text}

        </p>

      )}


      {loadingIntelligence ? (

        <>

          {[0, 1].map((index) => (

            <div
              key={index}
              className="
                bg-surface-muted
                border
                border-border
                rounded-xl
                p-5
                mb-5
              "
            >

              <Skeleton className="h-6 w-40 mb-3" />
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-4 w-28 mb-3" />
              <SkeletonText lines={2} />

              <div className="flex gap-3 mt-5">
                <Skeleton className="h-9 w-32" />
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-9 w-24" />
              </div>

            </div>

          ))}

        </>

      ) : loadError ? (

        <p className="text-danger">
          {loadError}
        </p>

      ) : recommendations.length === 0 ? (

        <p className="text-fg-muted">
          Nothing needs your attention right now.
        </p>

      ) : null}



      {recommendations.map((item,index)=>(


        <div

          key={index}

          className="
            bg-surface-muted
            border
            border-border
            rounded-xl
            p-5
            mb-5
          "

        >


          <h3 className="
            text-xl
            font-bold
            flex
            items-center
            gap-2
          ">

            <User size={18} />
            {item.customer}

          </h3>



          <p className="flex items-center gap-1.5">
            <Flame size={15} /> Priority: {item.priority}
          </p>


          <p className="flex items-center gap-1.5">
            <Pin size={15} /> Status: {item.status}
          </p>



          <p className="mt-3 text-fg-muted">

            <b>
              Situation:
            </b>

            {" "}

            {item.reason}

          </p>



          <p className="mt-2 text-success">

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
                flex
                items-center
                gap-1.5
              "
            >

              <CalendarCheck size={16} /> Create Follow-Up

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
                flex
                items-center
                gap-1.5
              "
            >

              <Smartphone size={16} /> SMS

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
                flex
                items-center
                gap-1.5
              "
            >

              <Mail size={16} /> Email

            </button>


          </div>


        </div>


      ))}



      {messageType && (

        <div className="
          bg-surface-muted
          border
          border-border
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

            <p className="mt-3 text-danger">
              {messageError}
            </p>

          ) : (

            <textarea

              aria-label={`Generated ${messageType} message`}

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
                bg-surface
                border
                border-border
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