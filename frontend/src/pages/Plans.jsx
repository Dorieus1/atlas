import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Repeat, Pause, Play, X, RotateCw, AlertTriangle, DollarSign, ListChecks } from "lucide-react";

import {
  getServiceAgreements,
  updateServiceAgreementStatus,
  renewServiceAgreement,
  getAnalytics
} from "../api/atlasApi";

import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import StatCard from "../components/dashboard/StatCard";

import {
  FREQUENCY_LABELS,
  STATUS_STYLES,
  LOW_VISITS_THRESHOLD,
  formatMoney,
  formatDate
} from "../utils/serviceAgreements";


const FILTERS = ["active", "paused", "cancelled", "all"];

// This business-wide list was a real depth gap found in a feature
// review: getServiceAgreementsByBusiness and GET /api/service-agreements
// were both fully built the day service agreements shipped, but the
// only place a plan was ever actually visible was its own customer's
// profile page (components/ServiceAgreements.jsx) - an owner with 40
// customers had no way to answer "how many plans do I have?" without
// clicking through all 40. This page is that answer, plus the recurring-
// revenue figure the business now generates but has never had anywhere
// to see totaled up.
function Plans() {

  const [agreements, setAgreements] = useState([]);
  const [stats, setStats] = useState({ activeServiceAgreements: 0, monthlyRecurringRevenue: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("active");

  const [confirmingCancelId, setConfirmingCancelId] = useState(null);
  const [actioningId, setActioningId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [actionNote, setActionNote] = useState("");


  const load = async () => {

    try {

      const [agreementData, analyticsData] = await Promise.all([
        getServiceAgreements(),
        getAnalytics()
      ]);

      setAgreements(agreementData);
      setStats(analyticsData);
      setLoadError("");

    } catch (err) {

      console.error("PLANS LOAD ERROR:", err);
      setLoadError("Couldn't load your service agreements. Please refresh to try again.");

    } finally {

      setLoading(false);

    }

  };

  useEffect(() => {

    load();

  }, []);

  const filtered = agreements.filter((a) => filter === "all" || a.status === filter);

  const handleStatusChange = async (id, status) => {

    setActioningId(id);
    setActionError("");
    setActionNote("");
    setConfirmingCancelId(null);

    try {

      await updateServiceAgreementStatus(id, status);
      await load();

    } catch (err) {

      console.error("PLAN STATUS ERROR:", err);
      setActionError(err.message || "Couldn't update that plan. Please try again.");

    } finally {

      setActioningId(null);

    }

  };

  const handleRenew = async (id) => {

    setActioningId(id);
    setActionError("");
    setActionNote("");

    try {

      const result = await renewServiceAgreement(id);
      setActionNote(result.message);
      await load();

    } catch (err) {

      console.error("PLAN RENEW ERROR:", err);
      setActionError(err.message || "Couldn't renew that plan. Please try again.");

    } finally {

      setActioningId(null);

    }

  };

  return (

    <div className="p-8">

      <h1 className="text-3xl font-bold flex items-center gap-2">
        <Repeat size={28} />
        Service Agreements
      </h1>

      <p className="mt-1 mb-6 text-sm text-fg-faint">
        Every recurring plan across your whole customer list, in one place.
      </p>

      <div className="grid gap-5 sm:grid-cols-2">

        <StatCard
          title="Active Plans"
          value={stats.activeServiceAgreements}
          icon={<ListChecks size={20} />}
          description="Currently active recurring plans"
        />

        <StatCard
          title="Monthly Recurring Revenue"
          value={stats.monthlyRecurringRevenue}
          format={formatMoney}
          icon={<DollarSign size={20} />}
          description="Active plans' price, converted to a monthly rate"
        />

      </div>

      <div className="mt-6 flex gap-2">

        {FILTERS.map((f) => (

          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${filter === f ? "bg-brand-600 text-white" : "bg-border text-fg-muted hover:bg-border-strong"}`}
          >
            {f}
          </button>

        ))}

      </div>

      {loadError && (
        <p className="mt-4 text-sm text-danger">
          {loadError}
        </p>
      )}

      {actionError && (
        <p className="mt-4 text-sm text-danger">
          {actionError}
        </p>
      )}

      {actionNote && (
        <p className="mt-4 text-sm text-success">
          {actionNote}
        </p>
      )}

      {loading ? (

        <div className="mt-6 flex flex-col gap-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>

      ) : filtered.length === 0 ? (

        <EmptyState
          icon={Repeat}
          title={filter === "active" ? "No active plans yet" : `No ${filter === "all" ? "" : filter} plans`}
          description="Start a plan from any customer's profile page."
        />

      ) : (

        <div className="mt-6 flex flex-col gap-3">

          {filtered.map((agreement) => (

            <div
              key={agreement.id}
              className="rounded-xl border border-border bg-surface p-4"
            >

              <div className="flex flex-wrap items-start justify-between gap-2">

                <div>

                  <p className="flex items-center gap-2 font-semibold">
                    {agreement.title}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[agreement.status]}`}>
                      {agreement.status}
                    </span>
                  </p>

                  <Link
                    to={`/customers/${agreement.customer_id}`}
                    className="text-sm text-accent-text hover:underline"
                  >
                    {agreement.customer_name}
                  </Link>

                  <p className="mt-1 text-xs text-fg-faint">
                    {FREQUENCY_LABELS[agreement.frequency] || agreement.frequency}
                    {agreement.price != null && ` · ${formatMoney(agreement.price)} per visit`}
                    {` · Started ${formatDate(agreement.start_date)}`}
                  </p>

                  {agreement.status === "active" && (

                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">

                      {agreement.next_visit_at ? (
                        <span className="text-fg-faint">
                          Next visit {formatDate(agreement.next_visit_at)}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-warning">
                          <AlertTriangle size={11} />
                          No visits scheduled - renew below
                        </span>
                      )}

                      {agreement.next_visit_at && agreement.visits_remaining <= LOW_VISITS_THRESHOLD && (
                        <span className="flex items-center gap-1 text-warning">
                          <AlertTriangle size={11} />
                          {agreement.visits_remaining} left - running low
                        </span>
                      )}

                    </p>

                  )}

                </div>

                <div className="flex shrink-0 items-center gap-1.5">

                  {agreement.status === "active" && (

                    <button
                      onClick={() => handleRenew(agreement.id)}
                      disabled={actioningId === agreement.id}
                      title="Schedule 12 more visits"
                      className="flex items-center gap-1 rounded-lg bg-border px-2.5 py-1.5 text-xs font-medium transition hover:bg-border-strong disabled:opacity-50"
                    >
                      <RotateCw size={12} />
                      Add Visits
                    </button>

                  )}

                  {agreement.status === "active" && (

                    <button
                      onClick={() => handleStatusChange(agreement.id, "paused")}
                      disabled={actioningId === agreement.id}
                      className="flex items-center gap-1 rounded-lg bg-border px-2.5 py-1.5 text-xs font-medium transition hover:bg-border-strong disabled:opacity-50"
                    >
                      <Pause size={12} />
                      Pause
                    </button>

                  )}

                  {agreement.status === "paused" && (

                    <button
                      onClick={() => handleStatusChange(agreement.id, "active")}
                      disabled={actioningId === agreement.id}
                      className="flex items-center gap-1 rounded-lg bg-success/20 px-2.5 py-1.5 text-xs font-medium text-success transition hover:bg-success/30 disabled:opacity-50"
                    >
                      <Play size={12} />
                      Resume
                    </button>

                  )}

                  {agreement.status !== "cancelled" && confirmingCancelId !== agreement.id && (

                    <button
                      onClick={() => setConfirmingCancelId(agreement.id)}
                      disabled={actioningId === agreement.id}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
                    >
                      Cancel
                    </button>

                  )}

                  {confirmingCancelId === agreement.id && (

                    <div className="flex items-center gap-1.5">

                      <span className="text-[11px] text-fg-faint">
                        End this plan?
                      </span>

                      <button
                        onClick={() => handleStatusChange(agreement.id, "cancelled")}
                        className="rounded-lg bg-danger/20 px-2.5 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/30"
                      >
                        Confirm
                      </button>

                      <button
                        onClick={() => setConfirmingCancelId(null)}
                        className="rounded-lg px-2 py-1.5 text-xs font-medium text-fg-muted transition hover:bg-border"
                        aria-label="Nevermind"
                      >
                        <X size={13} />
                      </button>

                    </div>

                  )}

                </div>

              </div>

            </div>

          ))}

        </div>

      )}

    </div>

  );

}

export default Plans;
