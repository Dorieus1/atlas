import { useEffect, useState } from "react";
import { Users, TrendingUp, Flame, Target } from "lucide-react";
import { getAnalytics } from "../api/atlasApi";

import StatCard from "./dashboard/StatCard";


function Dashboard(){


  const [stats,setStats] = useState({

    customers:0,

    leads:0,

    hotLeads:0

  });

  const [loadError, setLoadError] = useState("");




  useEffect(()=>{

    // request() (see atlasApi.js) already handles the auth header and a
    // 401 session-expiry redirect itself - this used to hand-roll both
    // with its own separate fetch(), one of a handful of components
    // across the app doing the same thing slightly differently (a
    // review finding).
    getAnalytics()

    .then(data=>{

      setStats(data);

      setLoadError("");

    })

    .catch((error)=>{

      console.error(error);

      setLoadError("Couldn't load your stats. Please refresh to try again.");

    });


  },[]);





  const conversion = stats.leads

    ? Math.round(

      (stats.hotLeads / stats.leads) * 100

    )

    : 0;

  let storedUser = null;

  try {

    storedUser = JSON.parse(localStorage.getItem("user"));

  } catch (e) {}

  const hour = new Date().getHours();

  const greeting =
    hour < 12 ? "Good morning" :
    hour < 18 ? "Good afternoon" :
    "Good evening";

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  });


  return (

    <div>


      <p className="text-sm font-medium text-accent-text">
        {today}
      </p>

      <h2 className="
        font-display
        text-3xl
        sm:text-4xl
        font-bold
        tracking-tight
        mb-6
        mt-1
      ">

        {greeting}{storedUser?.name ? `, ${storedUser.name.split(" ")[0]}` : ""}

      </h2>




      {loadError ? (

        <p className="text-danger">
          {loadError}
        </p>

      ) : (

      <div
        data-tour="stats"
        className="
        grid
        gap-5
        sm:grid-cols-2
        xl:grid-cols-4
      ">



        <StatCard

          title="Customers"

          value={stats.customers}

          icon={<Users size={20} />}

          description="Total customers"

        />



        <StatCard

          title="Total Leads"

          value={stats.leads}

          icon={<TrendingUp size={20} />}

          description="Captured opportunities"

        />



        <StatCard

          title="Hot Leads"

          value={stats.hotLeads}

          icon={<Flame size={20} />}

          description="Needs attention"

        />



        <StatCard

          title="Conversion"

          value={`${conversion}%`}

          icon={<Target size={20} />}

          description="Lead quality score"

        />



      </div>

      )}


    </div>

  );


}


export default Dashboard;