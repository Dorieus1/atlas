import { useEffect, useState } from "react";
import { API_BASE, handleSessionExpired } from "../api/atlasApi";

import StatCard from "./dashboard/StatCard";


function Dashboard(){


  const [stats,setStats] = useState({

    customers:0,

    leads:0,

    hotLeads:0

  });

  const [loadError, setLoadError] = useState("");




  useEffect(()=>{


    const token = localStorage.getItem("token");

    fetch(
      `${API_BASE}/api/analytics`,
      {
        headers: {
          ...(token
            ? { Authorization: `Bearer ${token}` }
            : {})
        }
      }
    )

    .then(res=>{

      if (!res.ok) {

        if (handleSessionExpired(res)) {

          throw new Error("Session expired");

        }

        throw new Error("Failed to load stats");

      }

      return res.json();

    })

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


      <p className="text-sm font-medium text-brand-400">
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

        <p className="text-red-400">
          {loadError}
        </p>

      ) : (

      <div className="
        grid
        gap-5
        md:grid-cols-4
      ">



        <StatCard

          title="Customers"

          value={stats.customers}

          icon="👥"

          description="Total customers"

        />



        <StatCard

          title="Total Leads"

          value={stats.leads}

          icon="📈"

          description="Captured opportunities"

        />



        <StatCard

          title="Hot Leads"

          value={stats.hotLeads}

          icon="🔥"

          description="Needs attention"

        />



        <StatCard

          title="Conversion"

          value={`${conversion}%`}

          icon="🎯"

          description="Lead quality score"

        />



      </div>

      )}


    </div>

  );


}


export default Dashboard;