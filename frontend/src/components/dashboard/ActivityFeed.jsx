import { useEffect, useState } from "react";


function ActivityFeed() {


  const [activities, setActivities] = useState([]);




  useEffect(() => {


    fetch(
  "http://localhost:5050/api/activities/53173694-8c94-42d2-a355-c0f6483a62ac"
)

      .then((res)=>res.json())

      .then((data)=>{

        setActivities(data);

      })

      .catch(console.error);


  }, []);





  return (

    <div className="
      bg-slate-900
      border
      border-slate-800
      rounded-2xl
      p-6
    ">


      <h2 className="
        text-xl
        font-bold
        mb-5
      ">

        🕒 Recent Activity

      </h2>



      <div className="space-y-3">


        {activities.length === 0 && (

          <p className="text-slate-500">

            No activity yet

          </p>

        )}




        {activities.map((item)=>(


          <div

            key={item.id}

            className="
              bg-slate-800
              rounded-xl
              p-4
            "

          >

            <p className="font-semibold">

              {item.type}

            </p>


            <p className="
              text-slate-400
              text-sm
              mt-1
            ">

              {item.content}

            </p>


          </div>


        ))}



      </div>


    </div>

  );


}


export default ActivityFeed;