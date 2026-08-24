import { useEffect, useState, useRef } from "react";
import { API_BASE, handleSessionExpired } from "../api/atlasApi";
import { downloadCSV } from "../utils/csv";

function LeadPipeline() {

  const [leads, setLeads] = useState([]);

  const [error, setError] = useState("");

  const [updatingId, setUpdatingId] = useState(null);

  const updatingRef = useRef(null);

  const token = localStorage.getItem("token");

  const formatDate = (dateStr) =>
    new Date(dateStr).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    });

  const isFollowUpOverdue = (lead) =>
    lead.status !== "closed" &&
    lead.next_follow_up &&
    new Date(lead.next_follow_up) < new Date();

  const exportCSV = () => {

    downloadCSV(

      "leads.csv",

      [
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "interest", label: "Interest" },
        { key: "status", label: "Status" },
        { key: "priority", label: "Priority" },
        { key: "last_contacted", label: "Last Contacted" },
        { key: "next_follow_up", label: "Next Follow-Up" },
        { key: "created_at", label: "Created At" }
      ],

      leads

    );

  };

  const loadLeads = async () => {

    try {

      const res = await fetch(
        `${API_BASE}/api/leads`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!res.ok) {

        if (handleSessionExpired(res)) {

          return;

        }

        console.error("Failed to load leads");

        setError("Couldn't load your leads. Please refresh to try again.");

        return;

      }

      const data = await res.json();

      if (Array.isArray(data)) {

        setLeads(data);

        setError("");

      } else {

        setLeads([]);

      }

    } catch (err) {

      console.error(err);

      setError("Couldn't load your leads. Please refresh to try again.");

    }

  };

  useEffect(() => {

    loadLeads();

  }, []);

  const updateStatus = async (id, status) => {

    if (updatingRef.current) {

      return;

    }

    updatingRef.current = id;

    setUpdatingId(id);

    try {

      const res = await fetch(
        `${API_BASE}/api/leads/${id}`,
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

      if (!res.ok) {

        if (handleSessionExpired(res)) {

          return;

        }

        const data = await res.json().catch(() => ({}));

        throw new Error(data.error || "Failed to update lead status");

      }

      setError("");

      loadLeads();

    } catch (err) {

      setError(err.message);

    } finally {

      updatingRef.current = null;

      setUpdatingId(null);

    }

  };

  return (

    <div className="mt-8 rounded-2xl border border-ink-700 bg-ink-900/60 p-6">

      <div className="flex flex-wrap items-center justify-between gap-3">

        <h2 className="text-2xl font-bold">
          🔥 Lead Pipeline
        </h2>

        {leads.length > 0 && (

          <button

            onClick={exportCSV}

            className="bg-ink-800 hover:bg-ink-700 border border-ink-700 px-4 py-2 rounded-lg text-sm"

          >

            ⬇️ Export CSV

          </button>

        )}

      </div>

      {error && (
        <p className="text-red-400 mt-3">
          {error}
        </p>
      )}

      <div className="mt-5 space-y-4">

        {leads.length === 0 ? (

          <div className="text-slate-400">

            No leads found.

          </div>

        ) : (

          leads.map((lead) => (

            <div
              key={lead.id}
              className={`bg-ink-800 rounded-xl p-5 ${isFollowUpOverdue(lead) ? "border border-red-600/50" : ""}`}
            >

              <div className="flex justify-between">

                <div>

                  <h3 className="font-bold text-lg">

                    {lead.name || "Unknown Customer"}

                  </h3>

                  <p className="text-slate-400">

                    {lead.email}

                  </p>

                  {lead.phone && (

                    <p className="text-slate-400">

                      {lead.phone}

                    </p>

                  )}

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

              {lead.last_contacted && (

                <p className="mt-1 text-slate-400 text-sm">

                  Last contacted: {formatDate(lead.last_contacted)}

                </p>

              )}

              {lead.next_follow_up && (

                <p className={`mt-1 text-sm ${isFollowUpOverdue(lead) ? "text-red-400 font-semibold" : "text-slate-400"}`}>

                  {isFollowUpOverdue(lead) ? "Follow-up overdue since " : "Next follow-up: "}
                  {formatDate(lead.next_follow_up)}

                </p>

              )}

              <div className="flex flex-wrap gap-3 mt-4">

                <button
                  onClick={() => updateStatus(lead.id, "contacted")}
                  disabled={updatingId === lead.id}
                  className="bg-brand-600 hover:bg-brand-500 px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  Contacted
                </button>

                <button
                  onClick={() => updateStatus(lead.id, "qualified")}
                  disabled={updatingId === lead.id}
                  className="bg-brand-600 hover:bg-brand-500 px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  Qualified
                </button>

                <button
                  onClick={() => updateStatus(lead.id, "closed")}
                  disabled={updatingId === lead.id}
                  className="bg-ink-800 hover:bg-ink-700 border border-ink-700 px-4 py-2 rounded-lg disabled:opacity-50"
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