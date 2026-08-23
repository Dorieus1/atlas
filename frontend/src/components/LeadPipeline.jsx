import { useEffect, useState } from "react";

function LeadPipeline() {

  const [leads, setLeads] = useState([]);

  const token = localStorage.getItem("token");

  const loadLeads = async () => {

    try {

      const res = await fetch(
        "http://localhost:5050/api/leads",
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!res.ok) {

        console.error("Failed to load leads");

        setLeads([]);

        return;

      }

      const data = await res.json();

      if (Array.isArray(data)) {

        setLeads(data);

      } else {

        setLeads([]);

      }

    } catch (error) {

      console.error(error);

      setLeads([]);

    }

  };

  useEffect(() => {

    loadLeads();

  }, []);

  const updateStatus = async (id, status) => {

    await fetch(
      `http://localhost:5050/api/leads/${id}`,
      {
        method: "PATCH",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },

        body: JSON.stringify({
          status
        })
      }
    );

    loadLeads();

  };

  return (

    <div className="mt-8 bg-slate-900 border border-slate-800 rounded-2xl p-6">

      <h2 className="text-2xl font-bold">
        🔥 Lead Pipeline
      </h2>

      <div className="mt-5 space-y-4">

        {leads.length === 0 ? (

          <div className="text-slate-400">

            No leads found.

          </div>

        ) : (

          leads.map((lead) => (

            <div
              key={lead.id}
              className="bg-slate-800 rounded-xl p-5"
            >

              <div className="flex justify-between">

                <div>

                  <h3 className="font-bold text-lg">

                    {lead.name || "Unknown Customer"}

                  </h3>

                  <p className="text-slate-400">

                    {lead.email}

                  </p>

                </div>

                <span className="bg-red-500/20 text-red-400 px-3 py-1 rounded-full">

                  {lead.priority}

                </span>

              </div>

              <p className="mt-4">

                {lead.interest}

              </p>

              <p className="mt-2 text-slate-400">

                Status: {lead.status || "new"}

              </p>

              <div className="flex gap-3 mt-4">

                <button
                  onClick={() => updateStatus(lead.id, "contacted")}
                  className="bg-blue-600 px-4 py-2 rounded-lg"
                >
                  Contacted
                </button>

                <button
                  onClick={() => updateStatus(lead.id, "qualified")}
                  className="bg-green-600 px-4 py-2 rounded-lg"
                >
                  Qualified
                </button>

                <button
                  onClick={() => updateStatus(lead.id, "closed")}
                  className="bg-slate-600 px-4 py-2 rounded-lg"
                >
                  Closed
                </button>

              </div>

            </div>

          ))

        )}

      </div>

    </div>

  );

}

export default LeadPipeline;