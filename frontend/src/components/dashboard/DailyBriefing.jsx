import { useEffect, useState } from "react";
import { getBriefing } from "../../api/atlasApi";


function DailyBriefing() {


  const [briefing, setBriefing] = useState("");

  const [stats, setStats] = useState(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");




  useEffect(()=>{


    const loadBriefing = async()=>{


      try {


        const data = await getBriefing();


        setBriefing(
          data.briefing || ""
        );


        setStats(
          data.stats || null
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
      bg-slate-800
      rounded-xl
      p-6
    ">


      <h2 className="
        text-2xl
        font-bold
        mb-5
      ">

        ☀️ Atlas Daily Briefing

      </h2>




      {loading ? (

        <p>

          Atlas is preparing your briefing...

        </p>


      ) : error ? (

        <p className="text-red-400">

          {error}

        </p>


      ) : (


        <>


          {stats && (

            <div className="
              grid
              grid-cols-3
              gap-4
              mb-6
            ">


              <div className="
                bg-slate-900
                rounded-lg
                p-4
              ">

                <p className="text-slate-400">
                  Total Leads
                </p>

                <p className="text-2xl font-bold">
                  {stats.totalLeads}
                </p>


              </div>




              <div className="
                bg-slate-900
                rounded-lg
                p-4
              ">

                <p className="text-slate-400">
                  Hot Leads
                </p>

                <p className="text-2xl font-bold">
                  {stats.hotLeads}
                </p>


              </div>




              <div className="
                bg-slate-900
                rounded-lg
                p-4
              ">

                <p className="text-slate-400">
                  Pending Tasks
                </p>

                <p className="text-2xl font-bold">
                  {stats.pendingTasks}
                </p>


              </div>


            </div>

          )}





          <div className="
            bg-slate-900
            rounded-xl
            p-5
          ">


            <p className="
              whitespace-pre-wrap
            ">

              {briefing || "No briefing available."}

            </p>


          </div>


        </>


      )}



    </div>

  );


}


export default DailyBriefing;