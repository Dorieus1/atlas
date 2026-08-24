import { useEffect, useState } from "react";
import { API_BASE, handleSessionExpired } from "../api/atlasApi";

import StatCard from "./dashboard/StatCard";


function Dashboard(){


  const [stats,setStats] = useState({

    customers:0,

    leads:0,

    hotLeads:0

  });




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

    })

    .catch(console.error);


  },[]);





  const conversion = stats.leads

    ? Math.round(

      (stats.hotLeads / stats.leads) * 100

    )

    : 0;




  return (

    <div>


      <h2 className="
        text-2xl
        font-bold
        mb-5
      ">

        Overview

      </h2>




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


    </div>

  );


}


export default Dashboard;