import { useEffect, useState } from "react";
import { Sun } from "lucide-react";
import { getBriefing } from "../../api/atlasApi";
import { SkeletonText } from "../Skeleton";


function DailyBriefing() {


  const [briefing, setBriefing] = useState("");

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");




  useEffect(()=>{


    const loadBriefing = async()=>{


      try {


        const data = await getBriefing();


        setBriefing(
          data.briefing || ""
        );


      } catch(error) {


        console.error(
          "BRIEFING ERROR:",
          error
        );


        setError(
          "Couldn't load today's briefing. Try refreshing the page."
        );


      } finally {


        setLoading(false);


      }


    };


    loadBriefing();


  },[]);






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
        mb-5
        flex
        items-center
        gap-2
      ">

        <Sun size={24} />
        Atlas Daily Briefing

      </h2>




      {loading ? (

        <div className="bg-ink-800 rounded-xl p-5">
          <SkeletonText lines={3} />
        </div>


      ) : error ? (

        <p className="text-red-400">

          {error}

        </p>


      ) : (

        <div className="
          bg-ink-800
          rounded-xl
          p-5
        ">


          <p className="
            whitespace-pre-wrap
          ">

            {briefing || "No briefing available."}

          </p>


        </div>

      )}



    </div>

  );


}


export default DailyBriefing;