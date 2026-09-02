import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays, FileText, Camera, LogOut, Plus, X, CreditCard, Download, Check, Ban } from "lucide-react";

import {
  getPortalMe,
  getPortalAppointments,
  requestPortalAppointment,
  cancelPortalAppointment,
  reschedulePortalAppointment,
  getPortalQuotes,
  getPortalQuote,
  createInvoiceCheckout,
  acceptPortalQuote,
  declinePortalQuote,
  createDepositCheckout,
  downloadPortalQuotePdf,
  getPortalPhotos,
  getPortalBusiness,
  API_BASE
} from "../api/atlasApi";

import Logo from "../components/Logo";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import SignaturePad from "../components/SignaturePad";
import { quoteDisplayNumber } from "../utils/quoteNumber";


const STATUS_STYLES = {
  requested: "bg-warning/20 text-warning",
  scheduled: "bg-accent-text/20 text-accent-text",
  completed: "bg-success/20 text-success",
  cancelled: "bg-slate-500/20 text-fg-muted",
  draft: "bg-slate-500/20 text-fg-muted",
  sent: "bg-accent-text/20 text-accent-text",
  accepted: "bg-success/20 text-success",
  declined: "bg-danger/20 text-danger",
  paid: "bg-success/20 text-success"
};

const STATUS_LABELS = {
  requested: "pending confirmation"
};

function formatMoney(amount) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount || 0);
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

// <input type="date">/<input type="time"> both take plain "local time"
// strings with no timezone attached - whatever gets typed into them is
// later parsed back as local time (see handleConfirmReschedule's own
// `new Date(...)` call, and handleRequestAppointment's identical
// pattern). Pre-filling the reschedule modal from appt.start_time (a
// UTC ISO string) requires converting to the LOCAL date/time first, not
// slicing the UTC string directly - slicing would show, say, "15:00" in
// the time field while actually meaning 15:00 UTC, and resubmitting
// that unchanged would silently reinterpret it as 15:00 *local*,
// shifting the appointment by the timezone offset.
function toLocalDateInputValue(dateString) {

  const d = new Date(dateString);

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;

}

function toLocalTimeInputValue(dateString) {

  const d = new Date(dateString);

  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;

}

// Mirrors the backend's own guard in loadOwnEditableAppointment
// (portalController.js) - an appointment that's already cancelled,
// already completed, or already in the past isn't something a customer
// can still act on, so the buttons shouldn't even offer to try.
function canManageAppointment(appt) {

  return (
    appt.status !== "cancelled" &&
    appt.status !== "completed" &&
    new Date(appt.start_time).getTime() > Date.now()
  );

}


function PortalDashboard() {

  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const paidParam = searchParams.get("paid");

  const [business, setBusiness] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [photos, setPhotos] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activePhoto, setActivePhoto] = useState(null);

  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestTitle, setRequestTitle] = useState("");
  const [requestDate, setRequestDate] = useState("");
  const [requestTime, setRequestTime] = useState("09:00");
  const [requestNotes, setRequestNotes] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requesting, setRequesting] = useState(false);
  const requestingRef = useRef(false);
  const [requestSuccess, setRequestSuccess] = useState("");

  const [cancellingId, setCancellingId] = useState(null);
  const [confirmingCancelId, setConfirmingCancelId] = useState(null);
  const [appointmentActionError, setAppointmentActionError] = useState("");

  const [reschedulingAppointment, setReschedulingAppointment] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("09:00");
  const [rescheduleError, setRescheduleError] = useState("");
  const [rescheduling, setRescheduling] = useState(false);

  const [payingId, setPayingId] = useState(null);
  const [payError, setPayError] = useState("");

  const [downloadingId, setDownloadingId] = useState(null);

  const [acceptingQuote, setAcceptingQuote] = useState(null);
  const [approvalName, setApprovalName] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [decliningId, setDecliningId] = useState(null);
  const [acceptTierId, setAcceptTierId] = useState("");
  const [loadingAcceptDetail, setLoadingAcceptDetail] = useState(false);
  const signaturePadRef = useRef(null);


  useEffect(() => {

    if (!localStorage.getItem("portal_token")) {

      navigate(`/portal/${slug}`, { replace: true });
      return;

    }

    getPortalBusiness(slug).then(setBusiness).catch(() => {});

    Promise.all([
      getPortalMe(),
      getPortalAppointments(),
      getPortalQuotes(),
      getPortalPhotos()
    ])
      .then(([me, myAppointments, myQuotes, myPhotos]) => {

        setCustomer(me);
        setAppointments(myAppointments);
        setQuotes(myQuotes);
        setPhotos(myPhotos);

      })
      .catch((err) => {

        console.error("PORTAL DASHBOARD LOAD ERROR:", err);

        if (err.status === 401) {

          localStorage.removeItem("portal_token");
          localStorage.removeItem("portal_customer");
          navigate(`/portal/${slug}`, { replace: true });
          return;

        }

        setError("Couldn't load your account. Please try again.");

      })
      .finally(() => setLoading(false));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);


  const handleLogout = () => {

    localStorage.removeItem("portal_token");
    localStorage.removeItem("portal_customer");
    navigate(`/portal/${slug}`, { replace: true });

  };


  const openRequestForm = () => {

    setRequestError("");
    setRequestTitle("");
    setRequestDate("");
    setRequestTime("09:00");
    setRequestNotes("");
    setShowRequestForm(true);

  };


  const handleRequestAppointment = async () => {

    if (!requestTitle.trim()) {
      setRequestError("Tell us what you need.");
      return;
    }

    if (!requestDate) {
      setRequestError("Pick a date.");
      return;
    }

    if (requestingRef.current) {
      return;
    }

    requestingRef.current = true;
    setRequesting(true);
    setRequestError("");

    try {

      const startTime = new Date(`${requestDate}T${requestTime || "09:00"}:00`).toISOString();

      await requestPortalAppointment(
        requestTitle.trim(),
        requestNotes.trim() || null,
        startTime,
        null
      );

      setShowRequestForm(false);
      setRequestSuccess("Request sent — we'll confirm it with you soon.");

      const myAppointments = await getPortalAppointments();
      setAppointments(myAppointments);

    } catch (error) {

      console.error("REQUEST APPOINTMENT ERROR:", error);
      setRequestError(error.message || "Couldn't send that request. Please try again.");

    } finally {

      requestingRef.current = false;
      setRequesting(false);

    }

  };


  const handleCancelAppointment = async (id) => {

    setCancellingId(id);
    setAppointmentActionError("");

    try {

      await cancelPortalAppointment(id);
      setConfirmingCancelId(null);

      const myAppointments = await getPortalAppointments();
      setAppointments(myAppointments);

    } catch (error) {

      console.error("CANCEL APPOINTMENT ERROR:", error);
      setAppointmentActionError(error.message || "Couldn't cancel that appointment. Please try again.");

    } finally {

      setCancellingId(null);

    }

  };


  const openRescheduleForm = (appt) => {

    setRescheduleError("");

    setRescheduleDate(toLocalDateInputValue(appt.start_time));
    setRescheduleTime(toLocalTimeInputValue(appt.start_time));
    setReschedulingAppointment(appt);

  };


  const handleConfirmReschedule = async () => {

    if (!reschedulingAppointment) {
      return;
    }

    if (!rescheduleDate) {
      setRescheduleError("Pick a date.");
      return;
    }

    setRescheduling(true);
    setRescheduleError("");

    try {

      const newStartTime = new Date(`${rescheduleDate}T${rescheduleTime || "09:00"}:00`).toISOString();

      await reschedulePortalAppointment(reschedulingAppointment.id, newStartTime);

      setReschedulingAppointment(null);
      setAppointmentActionError("");

      const myAppointments = await getPortalAppointments();
      setAppointments(myAppointments);

    } catch (error) {

      console.error("RESCHEDULE APPOINTMENT ERROR:", error);
      setRescheduleError(error.message || "Couldn't reschedule that appointment. Please try again.");

    } finally {

      setRescheduling(false);

    }

  };


  const handlePay = async (quoteId) => {

    setPayError("");
    setPayingId(quoteId);

    try {

      const { url } = await createInvoiceCheckout(quoteId);
      window.location.href = url;

    } catch (error) {

      console.error("PORTAL CHECKOUT ERROR:", error);
      setPayError(error.message || "Couldn't start checkout. Please try again.");
      setPayingId(null);

    }

  };


  const openAcceptConfirm = async (quote) => {

    setDecisionError("");
    setApprovalName("");
    setAcceptTierId("");
    // The list row (`quote`) only ever has one headline total, not a
    // "Good/Better/Best" quote's full per-option breakdown - fetch the
    // real detail before showing the picker, so there's something to
    // actually pick from.
    setAcceptingQuote(quote);
    setLoadingAcceptDetail(true);

    // The pad itself isn't mounted yet on this same render (the modal
    // JSX is gated on acceptingQuote), so clearing next tick avoids
    // reaching for a ref that doesn't exist yet.
    requestAnimationFrame(() => signaturePadRef.current?.clear());

    try {

      const full = await getPortalQuote(quote.id);

      setAcceptingQuote(full);

      if (Array.isArray(full.tiers) && full.tiers.length > 0) {

        setAcceptTierId((full.tiers.find((tier) => tier.is_recommended) || full.tiers[0]).id);

      }

    } catch (error) {

      console.error("LOAD QUOTE DETAIL ERROR:", error);
      setDecisionError("Couldn't load this quote's details. Please try again.");

    } finally {

      setLoadingAcceptDetail(false);

    }

  };


  const handleConfirmAccept = async () => {

    if (!acceptingQuote) return;

    if (!approvalName.trim()) {
      setDecisionError("Type your name to approve this.");
      return;
    }

    if (Array.isArray(acceptingQuote.tiers) && acceptingQuote.tiers.length > 0 && !acceptTierId) {
      setDecisionError("Choose which option you'd like.");
      return;
    }

    const signature = signaturePadRef.current?.getSignature();

    if (!signature) {
      setDecisionError("Please sign above to approve this.");
      return;
    }

    setDecisionSubmitting(true);
    setDecisionError("");

    try {

      await acceptPortalQuote(acceptingQuote.id, approvalName.trim(), signature, acceptTierId || undefined);

      setAcceptingQuote(null);

      const myQuotes = await getPortalQuotes();
      setQuotes(myQuotes);

    } catch (error) {

      console.error("ACCEPT QUOTE ERROR:", error);
      setDecisionError(error.message || "Couldn't save that. Please try again.");

    } finally {

      setDecisionSubmitting(false);

    }

  };


  const handleDecline = async (quoteId) => {

    setPayError("");
    setDecliningId(quoteId);

    try {

      await declinePortalQuote(quoteId);

      const myQuotes = await getPortalQuotes();
      setQuotes(myQuotes);

    } catch (error) {

      console.error("DECLINE QUOTE ERROR:", error);
      setPayError(error.message || "Couldn't save that. Please try again.");

    } finally {

      setDecliningId(null);

    }

  };


  const handlePayDeposit = async (quoteId) => {

    setPayError("");
    setPayingId(quoteId);

    try {

      const { url } = await createDepositCheckout(quoteId);
      window.location.href = url;

    } catch (error) {

      console.error("PORTAL DEPOSIT CHECKOUT ERROR:", error);
      setPayError(error.message || "Couldn't start checkout. Please try again.");
      setPayingId(null);

    }

  };


  const handleDownload = async (quoteId) => {

    setPayError("");
    setDownloadingId(quoteId);

    try {

      await downloadPortalQuotePdf(quoteId);

    } catch (error) {

      console.error("PORTAL PDF DOWNLOAD ERROR:", error);
      setPayError(error.message || "Couldn't download that PDF. Please try again.");

    } finally {

      setDownloadingId(null);

    }

  };


  if (loading) {

    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <p className="text-fg-faint">Loading...</p>
      </div>
    );

  }

  if (error) {

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg p-6 text-center">
        <Logo size={40} />
        <p className="mt-4 text-fg-muted">{error}</p>
      </div>
    );

  }

  return (

    <div className="min-h-screen bg-bg p-4 sm:p-6">

      <div className="mx-auto max-w-3xl">

        <div className="mb-6 flex items-center justify-between">

          <div className="flex items-center gap-3">

            <Logo size={30} />

            <div>
              <h1 className="font-display text-xl font-bold">
                {business?.name}
              </h1>
              <p className="text-sm text-fg-faint">
                Hi {customer?.name || "there"}
              </p>
            </div>

          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-fg-muted transition hover:bg-surface-muted hover:text-fg"
          >
            <LogOut size={15} />
            Log out
          </button>

        </div>

        {paidParam === "1" && (
          <p className="mb-6 rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success">
            Payment successful — thank you!
          </p>
        )}

        {paidParam === "0" && (
          <p className="mb-6 rounded-xl border border-border bg-surface-muted p-3 text-sm text-fg-muted">
            Payment cancelled — you weren't charged.
          </p>
        )}

        <div className="flex flex-col gap-6">

          <div className="rounded-2xl border border-border bg-surface/60 p-6">

            <div className="flex items-center justify-between gap-3">

              <h2 className="flex items-center gap-2 text-lg font-bold">
                <CalendarDays size={18} className="text-accent-text" />
                Appointments
              </h2>

              <button
                onClick={openRequestForm}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-500"
              >
                <Plus size={15} />
                Request
              </button>

            </div>

            {requestSuccess && (
              <p className="mt-3 text-sm text-success">
                {requestSuccess}
              </p>
            )}

            {appointmentActionError && (
              <p className="mt-3 text-sm text-danger">
                {appointmentActionError}
              </p>
            )}

            {appointments.length === 0 ? (

              <EmptyState
                icon={CalendarDays}
                title="No appointments yet"
                description="Anything scheduled with you will show up here."
              />

            ) : (

              <div className="mt-4 flex flex-col gap-2">

                {appointments.map((appt) => (

                  <div
                    key={appt.id}
                    className="flex flex-col gap-2 rounded-xl border border-border p-3"
                  >

                    <div className="flex items-center justify-between gap-3">

                      <div className="min-w-0">
                        <p className="truncate font-medium">{appt.title}</p>
                        <p className="text-xs text-fg-faint">{formatDate(appt.start_time)}</p>
                      </div>

                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[appt.status] || "bg-slate-500/20 text-fg-muted"}`}>
                        {STATUS_LABELS[appt.status] || appt.status}
                      </span>

                    </div>

                    {canManageAppointment(appt) && (

                      confirmingCancelId === appt.id ? (

                        <div className="flex flex-wrap items-center gap-3 text-xs">

                          <span className="text-fg-muted">Cancel this appointment?</span>

                          <button
                            onClick={() => handleCancelAppointment(appt.id)}
                            disabled={cancellingId === appt.id}
                            className="font-semibold text-danger hover:opacity-80 disabled:opacity-50"
                          >
                            {cancellingId === appt.id ? "Cancelling..." : "Yes, cancel it"}
                          </button>

                          <button
                            onClick={() => setConfirmingCancelId(null)}
                            className="text-fg-muted hover:text-fg"
                          >
                            Never mind
                          </button>

                        </div>

                      ) : (

                        <div className="flex items-center gap-4 text-xs font-semibold">

                          <button
                            onClick={() => openRescheduleForm(appt)}
                            className="text-accent-text hover:text-brand-300"
                          >
                            Reschedule
                          </button>

                          <button
                            onClick={() => setConfirmingCancelId(appt.id)}
                            className="text-fg-muted hover:text-danger"
                          >
                            Cancel
                          </button>

                        </div>

                      )

                    )}

                  </div>

                ))}

              </div>

            )}

          </div>

          <div className="rounded-2xl border border-border bg-surface/60 p-6">

            <h2 className="flex items-center gap-2 text-lg font-bold">
              <FileText size={18} className="text-accent-text" />
              Quotes &amp; Invoices
            </h2>

            {payError && (
              <p className="mt-3 text-sm text-danger">
                {payError}
              </p>
            )}

            {quotes.length === 0 ? (

              <EmptyState
                icon={FileText}
                title="Nothing here yet"
                description="Quotes and invoices from your jobs will show up here."
              />

            ) : (

              <div className="mt-4 flex flex-col gap-2">

                {quotes.map((quote) => {

                  // Once a deposit's been paid, the remaining balance - not
                  // the full total again - is what's actually still owed.
                  // A 100% deposit (or any deposit that happens to cover
                  // the whole total) leaves nothing left to pay, so the
                  // button must disappear entirely rather than offer to
                  // charge $0 or the full amount a second time.
                  const remainingBalance = quote.deposit_paid_at
                    ? Math.max(0, quote.total - quote.deposit_amount)
                    : quote.total;

                  const payable =
                    quote.type === "invoice" &&
                    (quote.status === "sent" || quote.status === "accepted") &&
                    remainingBalance > 0;

                  const decidable = quote.status === "sent";
                  const depositPayable = quote.deposit_type && quote.status === "accepted" && !quote.deposit_paid_at;

                  return (

                    <div
                      key={quote.id}
                      className="flex flex-col gap-3 rounded-xl border border-border p-3"
                    >

                      <div className="flex flex-wrap items-center justify-between gap-3">

                        <div className="min-w-0">
                          <p className="truncate font-medium capitalize">
                            {quote.type}
                            {quoteDisplayNumber(quote) && (
                              <span className="ml-1.5 text-fg-faint">
                                {quoteDisplayNumber(quote)}
                              </span>
                            )}
                          </p>
                          {quote.discount_type ? (
                            <p className="text-xs text-fg-faint">
                              <span className="mr-1.5 line-through">{formatMoney(quote.subtotal)}</span>
                              {formatMoney(quote.total)}
                              <span className="ml-1.5 text-success">
                                ({quote.discount_type === "percent" ? `${quote.discount_value}% off` : `${formatMoney(quote.discount_value)} off`})
                              </span>
                            </p>
                          ) : (
                            <p className="text-xs text-fg-faint">{formatMoney(quote.total)}</p>
                          )}

                          {quote.status === "accepted" && quote.accepted_by_name && (
                            <p className="mt-1 text-xs text-success">
                              Approved by {quote.accepted_by_name} on {formatDate(quote.accepted_at)}
                            </p>
                          )}

                          {quote.status === "declined" && quote.declined_at && (
                            <p className="mt-1 text-xs text-danger">
                              Declined on {formatDate(quote.declined_at)}
                            </p>
                          )}

                          {quote.deposit_type && (
                            <p className="mt-1 text-xs text-fg-faint">
                              {quote.deposit_paid_at
                                ? `Deposit of ${formatMoney(quote.deposit_amount)} paid`
                                : `Deposit of ${formatMoney(quote.deposit_amount)} due on approval`}
                            </p>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-2">

                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[quote.status] || "bg-slate-500/20 text-fg-muted"}`}>
                            {quote.status}
                          </span>

                          <button
                            onClick={() => handleDownload(quote.id)}
                            disabled={downloadingId === quote.id}
                            aria-label="Download PDF"
                            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-fg-muted transition hover:bg-surface-muted disabled:opacity-50"
                          >
                            <Download size={13} />
                          </button>

                          {payable && (
                            <button
                              onClick={() => handlePay(quote.id)}
                              disabled={payingId === quote.id}
                              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
                            >
                              <CreditCard size={13} />
                              {payingId === quote.id
                                ? "Redirecting..."
                                : quote.deposit_paid_at
                                  ? `Pay remaining balance ${formatMoney(remainingBalance)}`
                                  : `Pay ${formatMoney(quote.total)}`}
                            </button>
                          )}

                        </div>

                      </div>

                      {decidable && (

                        <div className="flex items-center gap-2 border-t border-border pt-3">

                          <button
                            onClick={() => openAcceptConfirm(quote)}
                            className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-green-500"
                          >
                            <Check size={13} />
                            Accept
                          </button>

                          <button
                            onClick={() => handleDecline(quote.id)}
                            disabled={decliningId === quote.id}
                            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-fg-muted transition hover:bg-surface-muted disabled:opacity-50"
                          >
                            <Ban size={13} />
                            {decliningId === quote.id ? "Declining..." : "Decline"}
                          </button>

                        </div>

                      )}

                      {depositPayable && (

                        <div className="border-t border-border pt-3">

                          <button
                            onClick={() => handlePayDeposit(quote.id)}
                            disabled={payingId === quote.id}
                            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
                          >
                            <CreditCard size={13} />
                            {payingId === quote.id ? "Redirecting..." : `Pay Deposit ${formatMoney(quote.deposit_amount)}`}
                          </button>

                        </div>

                      )}

                    </div>

                  );

                })}

              </div>

            )}

          </div>

          <div className="rounded-2xl border border-border bg-surface/60 p-6">

            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Camera size={18} className="text-accent-text" />
              Photos
            </h2>

            {photos.length === 0 ? (

              <EmptyState
                icon={Camera}
                title="No photos yet"
                description="Before/after shots from your job will show up here."
              />

            ) : (

              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">

                {photos.map((photo) => (

                  <button
                    key={photo.id}
                    onClick={() => setActivePhoto(photo)}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-border"
                  >
                    <img
                      src={`${API_BASE}${photo.url}`}
                      alt={photo.caption || "Job photo"}
                      className="h-full w-full object-cover transition group-hover:opacity-75"
                    />
                  </button>

                ))}

              </div>

            )}

          </div>

        </div>

        <p className="mt-6 text-center text-xs text-fg-faint">
          Powered by Atlas
        </p>

      </div>

      {showRequestForm && (

        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowRequestForm(false)}
        >

          <div
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="flex items-center justify-between">

              <h3 className="font-display text-lg font-bold">
                Request an appointment
              </h3>

              <button
                onClick={() => setShowRequestForm(false)}
                className="rounded-lg p-1 text-fg-muted hover:bg-surface-muted hover:text-fg"
                aria-label="Close"
              >
                <X size={18} />
              </button>

            </div>

            <p className="mt-1 text-sm text-fg-faint">
              We'll confirm the time with you before it's official.
            </p>

            {requestError && (
              <p className="mt-3 text-sm text-danger">
                {requestError}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-3">

              <input
                placeholder="What do you need? (e.g. Leak inspection)"
                value={requestTitle}
                onChange={(e) => setRequestTitle(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-muted p-3 text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
              />

              <div className="flex gap-3">

                <input
                  type="date"
                  value={requestDate}
                  onChange={(e) => setRequestDate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-muted p-3 text-fg focus:border-border-strong focus:outline-none"
                />

                <input
                  type="time"
                  value={requestTime}
                  onChange={(e) => setRequestTime(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-muted p-3 text-fg focus:border-border-strong focus:outline-none"
                />

              </div>

              <textarea
                placeholder="Anything else we should know? (optional)"
                value={requestNotes}
                onChange={(e) => setRequestNotes(e.target.value)}
                className="h-20 w-full rounded-lg border border-border bg-surface-muted p-3 text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
              />

              <button
                onClick={handleRequestAppointment}
                disabled={requesting}
                className="mt-1 rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
              >
                {requesting ? "Sending..." : "Send Request"}
              </button>

            </div>

          </div>

        </div>

      )}

      {reschedulingAppointment && (

        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setReschedulingAppointment(null)}
        >

          <div
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="flex items-center justify-between">

              <h3 className="font-display text-lg font-bold">
                Reschedule {reschedulingAppointment.title}
              </h3>

              <button
                onClick={() => setReschedulingAppointment(null)}
                className="rounded-lg p-1 text-fg-muted hover:bg-surface-muted hover:text-fg"
                aria-label="Close"
              >
                <X size={18} />
              </button>

            </div>

            <p className="mt-1 text-sm text-fg-faint">
              {reschedulingAppointment.status === "scheduled"
                ? "We'll need to confirm the new time with you before it's official."
                : "We'll take a look and confirm this time with you."}
            </p>

            {rescheduleError && (
              <p className="mt-3 text-sm text-danger">
                {rescheduleError}
              </p>
            )}

            <div className="mt-4 flex gap-3">

              <input
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-muted p-3 text-fg focus:border-border-strong focus:outline-none"
              />

              <input
                type="time"
                value={rescheduleTime}
                onChange={(e) => setRescheduleTime(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-muted p-3 text-fg focus:border-border-strong focus:outline-none"
              />

            </div>

            <button
              onClick={handleConfirmReschedule}
              disabled={rescheduling}
              className="mt-4 w-full rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
            >
              {rescheduling ? "Saving..." : "Confirm New Time"}
            </button>

          </div>

        </div>

      )}

      {activePhoto && (

        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setActivePhoto(null)}
        >

          <div
            className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface"
            onClick={(e) => e.stopPropagation()}
          >

            {activePhoto.caption && (
              <p className="truncate p-3 text-sm text-fg-muted">
                {activePhoto.caption}
              </p>
            )}

            <img
              src={`${API_BASE}${activePhoto.url}`}
              alt={activePhoto.caption || "Job photo"}
              className="max-h-[70vh] w-full object-contain"
            />

          </div>

        </div>

      )}

      {acceptingQuote && (

        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setAcceptingQuote(null)}
        >

          <div
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="flex items-center justify-between">

              <h3 className="font-display text-lg font-bold">
                Approve this {acceptingQuote.type}
              </h3>

              <button
                onClick={() => setAcceptingQuote(null)}
                className="rounded-lg p-1 text-fg-muted hover:bg-surface-muted hover:text-fg"
                aria-label="Close"
              >
                <X size={18} />
              </button>

            </div>

            <p className="mt-1 text-sm text-fg-faint">
              Type your name and sign below to approve this. {business?.name || "The business"} will
              have your signature on record.
            </p>

            {decisionError && (
              <p className="mt-3 text-sm text-danger">
                {decisionError}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-3">

              <input
                placeholder="Your full name"
                value={approvalName}
                onChange={(e) => setApprovalName(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-muted p-3 text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
              />

              {loadingAcceptDetail && (
                <p className="text-sm text-fg-faint">Loading the options...</p>
              )}

              {Array.isArray(acceptingQuote.tiers) && acceptingQuote.tiers.length > 0 && (

                <div className="flex flex-col gap-1.5">

                  <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">
                    Choose an option
                  </p>

                  {acceptingQuote.tiers.map((tier) => (

                    <label
                      key={tier.id}
                      className={`flex cursor-pointer items-start justify-between gap-2 rounded-lg border p-3 text-sm ${acceptTierId === tier.id ? "border-brand-500 bg-brand-600/10" : "border-border"}`}
                    >
                      <span className="flex items-start gap-2">
                        <input
                          type="radio"
                          name="accept-quote-tier"
                          checked={acceptTierId === tier.id}
                          onChange={() => setAcceptTierId(tier.id)}
                          className="mt-0.5 h-4 w-4 accent-brand-600"
                        />
                        <span>
                          <span className="font-medium">{tier.name}</span>
                          {tier.is_recommended && (
                            <span className="ml-2 rounded-full bg-brand-600/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-text">
                              Recommended
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold">{formatMoney(tier.total)}</span>
                    </label>

                  ))}

                </div>

              )}

              <SignaturePad ref={signaturePadRef} />

              <button
                onClick={handleConfirmAccept}
                disabled={decisionSubmitting || loadingAcceptDetail}
                className="mt-1 flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-5 py-3 font-semibold text-white transition hover:bg-green-500 disabled:opacity-50"
              >
                <Check size={16} />
                {decisionSubmitting ? "Saving..." : "Confirm approval"}
              </button>

            </div>

          </div>

        </div>

      )}

    </div>

  );

}

export default PortalDashboard;
