import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays, FileText, Camera, LogOut, Plus, X, CreditCard, Download } from "lucide-react";

import {
  getPortalMe,
  getPortalAppointments,
  requestPortalAppointment,
  getPortalQuotes,
  createInvoiceCheckout,
  downloadPortalQuotePdf,
  getPortalPhotos,
  getPortalBusiness,
  API_BASE
} from "../api/atlasApi";

import Logo from "../components/Logo";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import { quoteDisplayNumber } from "../utils/quoteNumber";


const STATUS_STYLES = {
  requested: "bg-amber-500/20 text-amber-400",
  scheduled: "bg-brand-500/20 text-brand-400",
  completed: "bg-green-500/20 text-green-400",
  cancelled: "bg-slate-500/20 text-slate-400",
  draft: "bg-slate-500/20 text-slate-300",
  sent: "bg-brand-500/20 text-brand-400",
  accepted: "bg-green-500/20 text-green-400",
  declined: "bg-red-500/20 text-red-400",
  paid: "bg-green-500/20 text-green-400"
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

  const [payingId, setPayingId] = useState(null);
  const [payError, setPayError] = useState("");

  const [downloadingId, setDownloadingId] = useState(null);


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
      <div className="flex min-h-screen items-center justify-center bg-ink-950">
        <p className="text-slate-500">Loading...</p>
      </div>
    );

  }

  if (error) {

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-ink-950 p-6 text-center">
        <Logo size={40} />
        <p className="mt-4 text-slate-400">{error}</p>
      </div>
    );

  }

  return (

    <div className="min-h-screen bg-ink-950 p-4 sm:p-6">

      <div className="mx-auto max-w-3xl">

        <div className="mb-6 flex items-center justify-between">

          <div className="flex items-center gap-3">

            <Logo size={30} />

            <div>
              <h1 className="font-display text-xl font-bold">
                {business?.name}
              </h1>
              <p className="text-sm text-slate-500">
                Hi {customer?.name || "there"}
              </p>
            </div>

          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-lg border border-ink-700 px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-ink-800 hover:text-white"
          >
            <LogOut size={15} />
            Log out
          </button>

        </div>

        {paidParam === "1" && (
          <p className="mb-6 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
            Payment successful — thank you!
          </p>
        )}

        {paidParam === "0" && (
          <p className="mb-6 rounded-xl border border-ink-700 bg-ink-800 p-3 text-sm text-slate-300">
            Payment cancelled — you weren't charged.
          </p>
        )}

        <div className="flex flex-col gap-6">

          <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-6">

            <div className="flex items-center justify-between gap-3">

              <h2 className="flex items-center gap-2 text-lg font-bold">
                <CalendarDays size={18} className="text-brand-400" />
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
              <p className="mt-3 text-sm text-green-400">
                {requestSuccess}
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
                    className="flex items-center justify-between gap-3 rounded-xl border border-ink-800 p-3"
                  >

                    <div className="min-w-0">
                      <p className="truncate font-medium">{appt.title}</p>
                      <p className="text-xs text-slate-500">{formatDate(appt.start_time)}</p>
                    </div>

                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[appt.status] || "bg-slate-500/20 text-slate-300"}`}>
                      {STATUS_LABELS[appt.status] || appt.status}
                    </span>

                  </div>

                ))}

              </div>

            )}

          </div>

          <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-6">

            <h2 className="flex items-center gap-2 text-lg font-bold">
              <FileText size={18} className="text-brand-400" />
              Quotes &amp; Invoices
            </h2>

            {payError && (
              <p className="mt-3 text-sm text-red-400">
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

                  const payable = quote.type === "invoice" && (quote.status === "sent" || quote.status === "accepted");

                  return (

                    <div
                      key={quote.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-800 p-3"
                    >

                      <div className="min-w-0">
                        <p className="truncate font-medium capitalize">
                          {quote.type}
                          {quoteDisplayNumber(quote) && (
                            <span className="ml-1.5 text-slate-500">
                              {quoteDisplayNumber(quote)}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">{formatMoney(quote.total)}</p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">

                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[quote.status] || "bg-slate-500/20 text-slate-300"}`}>
                          {quote.status}
                        </span>

                        <button
                          onClick={() => handleDownload(quote.id)}
                          disabled={downloadingId === quote.id}
                          aria-label="Download PDF"
                          className="flex items-center gap-1.5 rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-ink-800 disabled:opacity-50"
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
                            {payingId === quote.id ? "Redirecting..." : `Pay ${formatMoney(quote.total)}`}
                          </button>
                        )}

                      </div>

                    </div>

                  );

                })}

              </div>

            )}

          </div>

          <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-6">

            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Camera size={18} className="text-brand-400" />
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
                    className="group relative aspect-square overflow-hidden rounded-lg border border-ink-700"
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

        <p className="mt-6 text-center text-xs text-slate-600">
          Powered by Atlas
        </p>

      </div>

      {showRequestForm && (

        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowRequestForm(false)}
        >

          <div
            className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="flex items-center justify-between">

              <h3 className="font-display text-lg font-bold">
                Request an appointment
              </h3>

              <button
                onClick={() => setShowRequestForm(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-ink-800 hover:text-white"
                aria-label="Close"
              >
                <X size={18} />
              </button>

            </div>

            <p className="mt-1 text-sm text-slate-500">
              We'll confirm the time with you before it's official.
            </p>

            {requestError && (
              <p className="mt-3 text-sm text-red-400">
                {requestError}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-3">

              <input
                placeholder="What do you need? (e.g. Leak inspection)"
                value={requestTitle}
                onChange={(e) => setRequestTitle(e.target.value)}
                className="w-full rounded-lg border border-ink-700 bg-ink-800 p-3 text-white placeholder:text-slate-500 focus:border-ink-600 focus:outline-none"
              />

              <div className="flex gap-3">

                <input
                  type="date"
                  value={requestDate}
                  onChange={(e) => setRequestDate(e.target.value)}
                  className="w-full rounded-lg border border-ink-700 bg-ink-800 p-3 text-white focus:border-ink-600 focus:outline-none"
                />

                <input
                  type="time"
                  value={requestTime}
                  onChange={(e) => setRequestTime(e.target.value)}
                  className="w-full rounded-lg border border-ink-700 bg-ink-800 p-3 text-white focus:border-ink-600 focus:outline-none"
                />

              </div>

              <textarea
                placeholder="Anything else we should know? (optional)"
                value={requestNotes}
                onChange={(e) => setRequestNotes(e.target.value)}
                className="h-20 w-full rounded-lg border border-ink-700 bg-ink-800 p-3 text-white placeholder:text-slate-500 focus:border-ink-600 focus:outline-none"
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

      {activePhoto && (

        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setActivePhoto(null)}
        >

          <div
            className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl border border-ink-700 bg-ink-900"
            onClick={(e) => e.stopPropagation()}
          >

            {activePhoto.caption && (
              <p className="truncate p-3 text-sm text-slate-300">
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

    </div>

  );

}

export default PortalDashboard;
