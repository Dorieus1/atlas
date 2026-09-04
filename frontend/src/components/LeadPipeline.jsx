import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Flame, Download, Sparkles, UserSquare2, ArrowRight } from "lucide-react";
import { API_BASE, handleSessionExpired, generateFollowUpMessage, updateLeadSource } from "../api/atlasApi";
import { downloadCSV } from "../utils/csv";
import EmptyState from "./EmptyState";

// Matches Analytics.jsx's own PIPELINE_STAGES - same four stages, same
// order, so the board reads consistently with the funnel chart there.
const STATUS_COLUMNS = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "closed", label: "Closed" }
];

// aiService.js's classifyLead() only ever returns one of these three
// values, but every card was rendering its priority badge in the same
// red regardless of which one it got - a warm or even cold lead looked
// exactly as urgent as a genuinely hot one. Giving each level its own
// color (matching the red/amber/slate vocabulary already used for
// "urgent vs. neutral vs. low-priority" elsewhere in the app, e.g.
// Schedule.jsx's STATUS_STYLES) makes the board scannable at a glance
// instead of every card shouting the same false alarm.
const PRIORITY_STYLES = {
  hot: "bg-danger/20 text-danger",
  warm: "bg-warning/20 text-warning",
  cold: "bg-slate-500/20 text-fg-muted"
};

// Matches backend/controllers/leadController.js's VALID_LEAD_SOURCES and
// backend/services/analyticsService.js's SOURCE_LABELS exactly - an
// owner deciding where to spend marketing money needs to know which
// channel actually brings leads in, not just how many exist.
const SOURCE_OPTIONS = [
  { value: "", label: "Source: not set" },
  { value: "google", label: "Google" },
  { value: "referral", label: "Referral" },
  { value: "social_media", label: "Social Media" },
  { value: "yard_sign_vehicle", label: "Yard Sign / Vehicle" },
  { value: "repeat_customer", label: "Repeat Customer" },
  { value: "website", label: "Website" },
  { value: "other", label: "Other" }
];

// A review caught a real layout bug: the full board's grid
// (sm:grid-cols-2 xl:grid-cols-4, further down) reacts to VIEWPORT
// width, not the width of whatever box it's actually sitting in -
// Dashboard.jsx embeds this same component in a third-of-the-page
// column, so on a real desktop the viewport is easily "xl" while the
// component's own rendered box is only ~1/3 of that, and it was
// cramming all 4 kanban columns into that one narrow slot instead of
// the full board it looks fine as on the dedicated /leads page (which
// gives it the whole width). Rather than fight a full 4-column board
// into a space it was never designed for, `compact` swaps in a
// different, deliberately smaller view for the dashboard: the leads
// that most need attention right now (open, hottest first), as a
// simple list rather than a board, with a link to the real thing.
const PRIORITY_RANK = { hot: 0, warm: 1, cold: 2 };
const COMPACT_LEAD_LIMIT = 5;

function LeadPipeline({ compact = false }) {

  const [leads, setLeads] = useState([]);

  const [error, setError] = useState("");

  const [updatingId, setUpdatingId] = useState(null);

  const updatingRef = useRef(null);

  // Per-lead AI follow-up drafting - keyed by lead id, since any number
  // of these cards can be open/loading/showing a result independently.
  const [followUpMessages, setFollowUpMessages] = useState({});
  const [followUpLoadingId, setFollowUpLoadingId] = useState(null);
  const [followUpErrors, setFollowUpErrors] = useState({});

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
        { key: "source", label: "Source" },
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

  const changeSource = async (id, source) => {

    try {

      await updateLeadSource(id, source || null);
      setError("");
      loadLeads();

    } catch (err) {

      console.error("LEAD SOURCE ERROR:", err);
      setError(err.message || "Couldn't update lead source. Please try again.");

    }

  };

  const generateFollowUp = async (lead) => {

    setFollowUpLoadingId(lead.id);

    setFollowUpErrors((prev) => ({ ...prev, [lead.id]: "" }));

    try {

      const data = await generateFollowUpMessage(lead.name, lead.interest);

      setFollowUpMessages((prev) => ({ ...prev, [lead.id]: data.message || "" }));

    } catch (err) {

      console.error("FOLLOW UP ERROR:", err);

      setFollowUpErrors((prev) => ({
        ...prev,
        [lead.id]: "Couldn't generate a follow-up message. Please try again."
      }));

    } finally {

      setFollowUpLoadingId(null);

    }

  };


  const renderLeadCard = (lead) => (

    <div
      key={lead.id}
      className={`bg-surface-muted rounded-xl p-5 ${isFollowUpOverdue(lead) ? "border border-red-600/50" : ""}`}
    >

      <div className="flex justify-between">

        <div className="min-w-0">

          <h3 className="truncate font-bold text-lg">

            {lead.name || "Unknown Customer"}

          </h3>

          {lead.customer_id && (

            // A lead and its customer are two separate records for the
            // same person - without this, an owner has no way to get
            // from a lead card to that person's full history (past
            // jobs, notes, quotes) without separately searching
            // Customers by name and hoping it matches.
            <Link
              to={`/customers/${lead.customer_id}`}
              className="mt-0.5 inline-flex items-center gap-1 text-xs text-accent-text hover:opacity-80"
            >
              <UserSquare2 size={12} />
              View customer profile
            </Link>

          )}

          <p className="mt-1 truncate text-fg-muted">

            {lead.email}

          </p>

          {lead.phone && (

            <p className="text-fg-muted">

              {lead.phone}

            </p>

          )}

        </div>

        <span className={`shrink-0 rounded-full px-3 py-1 capitalize ${PRIORITY_STYLES[lead.priority] || "bg-slate-500/20 text-fg-muted"}`}>

          {lead.priority}

        </span>

      </div>

      <p className="mt-4">

        {lead.interest}

      </p>

      {lead.last_contacted && (

        <p className="mt-1 text-fg-muted text-sm">

          Last contacted: {formatDate(lead.last_contacted)}

        </p>

      )}

      {lead.next_follow_up && (

        <p className={`mt-1 text-sm ${isFollowUpOverdue(lead) ? "text-danger font-semibold" : "text-fg-muted"}`}>

          {isFollowUpOverdue(lead) ? "Follow-up overdue since " : "Next follow-up: "}
          {formatDate(lead.next_follow_up)}

        </p>

      )}

      <div className="flex flex-wrap gap-2 mt-4">

        {["contacted", "qualified", "closed"].map((statusOption) => {

          const isActive = (lead.status || "new") === statusOption;

          return (

            <button
              key={statusOption}
              onClick={() => updateStatus(lead.id, statusOption)}
              disabled={updatingId === lead.id || isActive}
              className={
                isActive
                  ? "bg-brand-600/20 text-accent-text border border-brand-500 px-3 py-1.5 rounded-lg text-xs capitalize disabled:opacity-100"
                  : "bg-surface hover:bg-border border border-border px-3 py-1.5 rounded-lg text-xs capitalize disabled:opacity-50"
              }
            >
              {statusOption}
            </button>

          );

        })}

      </div>

      <select
        value={lead.source || ""}
        onChange={(e) => changeSource(lead.id, e.target.value)}
        aria-label="Lead source"
        className="mt-3 w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-fg-muted focus:border-border-strong focus:outline-none"
      >

        {SOURCE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}

      </select>

      <div className="mt-4 border-t border-border pt-4">

        <button
          onClick={() => generateFollowUp(lead)}
          disabled={followUpLoadingId === lead.id}
          className="text-sm text-accent-text hover:opacity-80 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {followUpLoadingId === lead.id
            ? "Generating..."
            : (<><Sparkles size={14} /> Generate Follow-Up Message</>)}
        </button>

        {followUpErrors[lead.id] && (

          <p className="mt-2 text-sm text-danger">
            {followUpErrors[lead.id]}
          </p>

        )}

        {followUpMessages[lead.id] && (

          <div className="mt-3 whitespace-pre-wrap rounded-lg bg-surface p-4 text-sm">
            {followUpMessages[lead.id]}
          </div>

        )}

      </div>

    </div>

  );


  if (compact) {

    const topLeads = leads
      .filter((lead) => (lead.status || "new") !== "closed")
      .sort((a, b) => {

        const rankDiff = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);

        if (rankDiff !== 0) {
          return rankDiff;
        }

        return new Date(b.created_at) - new Date(a.created_at);

      })
      .slice(0, COMPACT_LEAD_LIMIT);

    return (

      <div className="h-full rounded-2xl border border-border bg-surface/60 p-6">

        <div className="flex items-center justify-between gap-3">

          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Flame size={22} />
            Lead Pipeline
          </h2>

          <Link
            to="/leads"
            className="flex shrink-0 items-center gap-1 text-sm text-accent-text hover:opacity-80"
          >
            View All
            <ArrowRight size={14} />
          </Link>

        </div>

        {error && (
          <p className="text-danger mt-3">
            {error}
          </p>
        )}

        {topLeads.length === 0 ? (

          <div className="mt-5">
            <EmptyState
              icon={Flame}
              title="No open leads"
              description="Leads are created automatically as Atlas chats with your customers."
            />
          </div>

        ) : (

          <div className="mt-5 flex flex-col gap-3">

            {topLeads.map((lead) => (

              <Link
                key={lead.id}
                to={lead.customer_id ? `/customers/${lead.customer_id}` : "/leads"}
                className="flex items-center justify-between gap-3 rounded-xl bg-surface-muted p-4 transition hover:bg-border"
              >

                <div className="min-w-0">

                  <p className="truncate font-semibold">
                    {lead.name || "Unknown Customer"}
                  </p>

                  <p className="mt-0.5 truncate text-sm text-fg-muted">
                    {lead.interest}
                  </p>

                </div>

                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs capitalize ${PRIORITY_STYLES[lead.priority] || "bg-slate-500/20 text-fg-muted"}`}>
                  {lead.priority}
                </span>

              </Link>

            ))}

          </div>

        )}

      </div>

    );

  }

  return (

    <div className="h-full rounded-2xl border border-border bg-surface/60 p-6">

      <div className="flex flex-wrap items-center justify-between gap-3">

        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Flame size={22} />
          Lead Pipeline
        </h2>

        {leads.length > 0 && (

          <button

            onClick={exportCSV}

            className="bg-surface-muted hover:bg-border border border-border px-4 py-2 rounded-lg text-sm flex items-center gap-1.5"

          >

            <Download size={14} /> Export CSV

          </button>

        )}

      </div>

      {error && (
        <p className="text-danger mt-3">
          {error}
        </p>
      )}

      {leads.length === 0 ? (

        <div className="mt-5">

          <EmptyState
            icon={Flame}
            title="No leads yet"
            description="Leads are created automatically as Atlas chats with your customers."
          />

        </div>

      ) : (

        // Grouped into a status board rather than one long list - a
        // business with real lead volume needs to scan "what's stuck in
        // Contacted" at a glance, not scroll past every Closed lead to
        // find it. Each column scrolls independently once it grows past
        // a screen's worth, rather than the whole page growing forever.
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

          {STATUS_COLUMNS.map((column) => {

            const columnLeads = leads.filter((lead) => (lead.status || "new") === column.key);

            return (

              <div key={column.key} className="flex min-w-0 flex-col">

                <div className="flex items-center gap-2 px-1 pb-3">

                  <h3 className="text-sm font-semibold text-fg-muted">
                    {column.label}
                  </h3>

                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-fg-faint">
                    {columnLeads.length}
                  </span>

                </div>

                <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-0.5">

                  {columnLeads.length === 0 ? (

                    <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-fg-faint">
                      Nothing here
                    </p>

                  ) : (

                    columnLeads.map((lead) => renderLeadCard(lead))

                  )}

                </div>

              </div>

            );

          })}

        </div>

      )}

    </div>

  );

}

export default LeadPipeline;
