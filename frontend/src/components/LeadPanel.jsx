import { useEffect, useState } from "react";

function LeadPanel() {

  const [leads, setLeads] = useState([]);


  const loadLeads = () => {

    fetch("http://localhost:5050/api/leads")
      .then((res) => res.json())
      .then((data) => setLeads(data))
      .catch(console.error);

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
        },

        body: JSON.stringify({
          status
        }),

      }
    );


    loadLeads();

  };



  const priorityLabel = (priority) => {

    if (priority === "hot") return "🔥 HOT";

    if (priority === "warm") return "🟡 WARM";

    return "🔵 COLD";

  };



  return (

    <div className="card">

      <h2>Leads</h2>


      {leads.map((lead) => (

        <div
          key={lead.id}
          style={{
            borderBottom: "1px solid #ddd",
            padding: "12px 0"
          }}
        >

          <h3>
            {priorityLabel(lead.priority)}
          </h3>


          <strong>
            {lead.name || "Unknown"}
          </strong>


          <div>
            {lead.email || "No email"}
          </div>


          <p>
            {lead.interest}
          </p>


          <label>
            Status:
          </label>


          <select

            value={lead.status}

            onChange={(e) =>
              updateStatus(
                lead.id,
                e.target.value
              )
            }

          >

            <option value="new">
              New
            </option>


            <option value="contacted">
              Contacted
            </option>


            <option value="qualified">
              Qualified
            </option>


            <option value="won">
              Won
            </option>


            <option value="lost">
              Lost
            </option>


          </select>


        </div>

      ))}


    </div>

  );

}


export default LeadPanel;