import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { CalendarDays, FileText, Camera, LogOut } from "lucide-react";

import {
  getPortalMe,
  getPortalAppointments,
  getPortalQuotes,
  getPortalPhotos,
  getPortalBusiness,
  API_BASE
} from "../api/atlasApi";

import Logo from "../components/Logo";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";


const STATUS_STYLES = {
  scheduled: "bg-brand-500/20 text-brand-400",
  completed: "bg-green-500/20 text-green-400",
  cancelled: "bg-slate-500/20 text-slate-400",
  draft: "bg-slate-500/20 text-slate-300",
  sent: "bg-brand-500/20 text-brand-400",
  accepted: "bg-green-500/20 text-green-400",
  declined: "bg-red-500/20 text-red-400",
  paid: "bg-green-500/20 text-green-400"
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

  const [business, setBusiness] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [photos, setPhotos] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activePhoto, setActivePhoto] = useState(null);


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

        <div className="flex flex-col gap-6">

          <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-6">

            <h2 className="flex items-center gap-2 text-lg font-bold">
              <CalendarDays size={18} className="text-brand-400" />
              Appointments
            </h2>

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
                      {appt.status}
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

            {quotes.length === 0 ? (

              <EmptyState
                icon={FileText}
                title="Nothing here yet"
                description="Quotes and invoices from your jobs will show up here."
              />

            ) : (

              <div className="mt-4 flex flex-col gap-2">

                {quotes.map((quote) => (

                  <div
                    key={quote.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-ink-800 p-3"
                  >

                    <div className="min-w-0">
                      <p className="truncate font-medium capitalize">{quote.type}</p>
                      <p className="text-xs text-slate-500">{formatMoney(quote.total)}</p>
                    </div>

                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[quote.status] || "bg-slate-500/20 text-slate-300"}`}>
                      {quote.status}
                    </span>

                  </div>

                ))}

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
