import { useEffect, useState } from "react";
import { Repeat, Plus, Pause, Play, X, RotateCw } from "lucide-react";

import {
  getCustomerServiceAgreements,
  createServiceAgreement,
  updateServiceAgreementStatus,
  renewServiceAgreement
} from "../api/atlasApi";


function formatMoney(amount) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount || 0);
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString(undefined, { dateStyle: "medium" });
}

const FREQUENCY_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Every 3 months" },
  { value: "annually", label: "Annually" }
];

const FREQUENCY_LABELS = Object.fromEntries(FREQUENCY_OPTIONS.map((f) => [f.value, f.label]));

const STATUS_STYLES = {
  active: "bg-success/20 text-success",
  paused: "bg-warning/20 text-warning",
  cancelled: "bg-slate-500/20 text-fg-muted"
};

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};


// Recurring maintenance/service plans (quarterly pest control, monthly
// lawn care, etc) for one customer - lives on the customer profile
// rather than as its own nav item since a plan only ever makes sense in
// the context of the one customer it belongs to. Each plan is backed by
// a real batch of scheduled appointments (see serviceAgreementService.js
// on the backend) - this component only manages the plan's own
// lifecycle (create, pause/resume, cancel, renew); the generated visits
// themselves are managed on the Schedule page like any other
// appointment.
function ServiceAgreements({ customerId }) {

  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [startDate, setStartDate] = useState(todayLocal());
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);

  const [confirmingCancelId, setConfirmingCancelId] = useState(null);
  const [actioningId, setActioningId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [actionNote, setActionNote] = useState("");


  const load = async () => {

    try {

      const data = await getCustomerServiceAgreements(customerId);
      setAgreements(data);
      setLoadError("");

    } catch (err) {

      console.error("SERVICE AGREEMENTS LOAD ERROR:", err);
      setLoadError("Couldn't load this customer's service agreements. Please refresh to try again.");

    } finally {

      setLoading(false);

    }

  };


  useEffect(() => {

    setAgreements([]);
    setLoading(true);
    setLoadError("");

    load();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);


  const resetForm = () => {

    setTitle("");
    setPrice("");
    setFrequency("monthly");
    setStartDate(todayLocal());
    setFormError("");

  };


  const handleCreate = async () => {

    if (!title.trim()) {
      setFormError("Give the plan a name, e.g. \"Quarterly Pest Control\".");
      return;
    }

    if (!startDate) {
      setFormError("Pick a start date.");
      return;
    }

    setCreating(true);
    setFormError("");

    try {

      await createServiceAgreement(

        customerId,
        title.trim(),
        null,
        price === "" ? null : Number(price),
        frequency,
        new Date(`${startDate}T09:00:00`).toISOString()

      );

      resetForm();
      setShowForm(false);
      await load();

    } catch (err) {

      console.error("SERVICE AGREEMENT CREATE ERROR:", err);
      setFormError(err.message || "Couldn't create that plan. Please try again.");

    } finally {

      setCreating(false);

    }

  };


  const handleStatusChange = async (id, status) => {

    setActioningId(id);
    setActionError("");
    setActionNote("");
    setConfirmingCancelId(null);

    try {

      await updateServiceAgreementStatus(id, status);
      await load();

    } catch (err) {

      console.error("SERVICE AGREEMENT STATUS ERROR:", err);
      setActionError("Couldn't update that plan. Please try again.");

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

      console.error("SERVICE AGREEMENT RENEW ERROR:", err);
      setActionError("Couldn't renew that plan. Please try again.");

    } finally {

      setActioningId(null);

    }

  };


  if (loading) {
    return null;
  }

  return (

    <div className="rounded-2xl border border-border bg-surface/60 p-6">

      <div className="flex items-center justify-between gap-3">

        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Repeat size={18} />
          Service Agreements
        </h2>

        <button
          onClick={() => {
            setShowForm((v) => !v);
            setFormError("");
          }}
          className="flex items-center gap-1 rounded-lg bg-border px-3 py-1.5 text-xs font-medium transition hover:bg-border-strong"
        >
          {showForm ? <X size={13} /> : <Plus size={13} />}
          {showForm ? "Cancel" : "New Plan"}
        </button>

      </div>

      {loadError && (
        <p className="mt-3 text-sm text-danger">
          {loadError}
        </p>
      )}

      {showForm && (

        <div className="mt-4 rounded-xl border border-border bg-surface-muted p-4">

          <div className="grid gap-3 sm:grid-cols-2">

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
                Plan Name
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Quarterly Pest Control"
                className="w-full rounded-lg border border-border bg-surface p-2.5 text-sm text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
                Frequency
              </label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface p-2.5 text-sm text-fg focus:border-border-strong focus:outline-none"
              >
                {FREQUENCY_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
                Price Per Visit
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg border border-border bg-surface p-2.5 text-sm text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
                First Visit Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface p-2.5 text-sm text-fg focus:border-border-strong focus:outline-none"
              />
            </div>

          </div>

          {formError && (
            <p className="mt-3 text-sm text-danger">
              {formError}
            </p>
          )}

          <button
            onClick={handleCreate}
            disabled={creating}
            className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Plan"}
          </button>

          <p className="mt-2 text-xs text-fg-faint">
            Schedules the next 12 visits right away - use "Add More Visits" on the plan once it starts running low.
          </p>

        </div>

      )}

      {actionError && (
        <p className="mt-3 text-sm text-danger">
          {actionError}
        </p>
      )}

      {actionNote && (
        <p className="mt-3 text-sm text-success">
          {actionNote}
        </p>
      )}

      {agreements.length === 0 ? (

        <p className="mt-4 text-sm text-fg-faint">
          No recurring plans for this customer yet.
        </p>

      ) : (

        <div className="mt-4 flex flex-col gap-3">

          {agreements.map((agreement) => (

            <div
              key={agreement.id}
              className="rounded-xl border border-border bg-surface-muted p-4"
            >

              <div className="flex flex-wrap items-start justify-between gap-2">

                <div>

                  <p className="flex items-center gap-2 font-semibold">
                    {agreement.title}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[agreement.status]}`}>
                      {agreement.status}
                    </span>
                  </p>

                  <p className="mt-1 text-xs text-fg-faint">
                    {FREQUENCY_LABELS[agreement.frequency] || agreement.frequency}
                    {agreement.price != null && ` · ${formatMoney(agreement.price)} per visit`}
                    {` · Started ${formatDate(agreement.start_date)}`}
                  </p>

                </div>

                <div className="flex items-center gap-1.5">

                  {agreement.status === "active" && (

                    <button
                      onClick={() => handleRenew(agreement.id)}
                      disabled={actioningId === agreement.id}
                      title="Schedule 12 more visits"
                      className="flex items-center gap-1 rounded-lg bg-border px-2.5 py-1.5 text-xs font-medium transition hover:bg-border-strong disabled:opacity-50"
                    >
                      <RotateCw size={12} />
                      Add More Visits
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

export default ServiceAgreements;
