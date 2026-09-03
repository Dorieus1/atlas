import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Sun,
  Clock,
  Check,
  Phone,
  MapPin,
  User,
  AlertTriangle,
  CalendarDays,
  PenLine,
  Camera,
  X
} from "lucide-react";

import {
  getAppointments,
  getTeammates,
  clockInAppointment,
  clockOutAppointment,
  updateAppointmentStatus,
  getQuoteByAppointment,
  signQuoteInPerson
} from "../api/atlasApi";

import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import SignaturePad from "../components/SignaturePad";
import JobPhotosModal from "../components/JobPhotosModal";
import { formatMinutes, summarizeTimeEntries } from "../utils/duration";


// Same local-calendar-day logic Schedule.jsx and CustomerTimeline.jsx
// each already have their own copy of, for the same reason spelled out
// there: reading start_time's UTC date directly would put an evening
// job on the wrong day for any timezone behind UTC.
function toDateKey(date) {

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;

}


function formatTime(dateString) {
  return new Date(dateString).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}


// A phone tel: link needs a plain digit-and-plus string, not whatever
// formatting (spaces, dashes, parens) a customer's phone number happens
// to be stored with.
function telHref(phone) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}


function directionsHref(address) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}


// The mobile-first "what do I need to do right now" view, built for
// someone standing at (or between) job sites, not sitting at a desk -
// deliberately a completely different page from Schedule.jsx rather
// than a responsive variant of it. Schedule is a planning tool (a whole
// month/week, drag-to-reschedule, recurring series); this is an
// execution tool (today's jobs, in order, one tap to clock in/out or
// mark done) - trying to make one component serve both would have
// meant either compromising the planning UI for a phone screen or
// hiding half of Schedule's own complexity behind mobile breakpoints.
// Reuses every backend endpoint Schedule already uses (clock-in/out,
// status update) - nothing new needed there beyond the customer phone/
// address now joined into GET /api/appointments.
function Today() {

  const navigate = useNavigate();

  const [appointments, setAppointments] = useState([]);
  const [teammates, setTeammates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [clockingId, setClockingId] = useState(null);
  const [completingId, setCompletingId] = useState(null);

  // appointment_id -> quote row, but only ever populated for quotes
  // that are actually status "sent" - the one state a quote can be
  // signed from. Anything else (draft, already accepted, paid) just
  // never gets a key here, so "is this job signable right now" is a
  // single, cheap `signableQuotes[appt.id]` lookup at render time.
  const [signableQuotes, setSignableQuotes] = useState({});
  const [signingAppt, setSigningAppt] = useState(null);
  const [signName, setSignName] = useState("");
  const [signError, setSignError] = useState("");
  const [signSubmitting, setSignSubmitting] = useState(false);
  const signaturePadRef = useRef(null);

  const [photosAppt, setPhotosAppt] = useState(null);

  // "mine" once teammates load and the signed-in user turns out to be
  // staff - a crew member's own phone should open straight to their own
  // jobs, not the whole team's, the same default Schedule.jsx already
  // applies to its own assignee filter.
  const [scope, setScope] = useState("everyone");

  const currentUserId = (() => {

    try {
      return JSON.parse(localStorage.getItem("user") || "{}").id;
    } catch {
      return null;
    }

  })();

  const load = async () => {

    try {

      const [apptData, teammateData] = await Promise.all([
        getAppointments(),
        getTeammates()
      ]);

      setAppointments(apptData);
      setTeammates(teammateData);
      setLoadError("");

    } catch (err) {

      console.error("TODAY LOAD ERROR:", err);
      setLoadError("Couldn't load today's jobs. Please refresh to try again.");

    } finally {

      setLoading(false);

    }

  };

  useEffect(() => {

    load();

  }, []);

  useEffect(() => {

    const currentUser = teammates.find((t) => t.id === currentUserId);

    if (currentUser?.role === "staff") {
      setScope("mine");
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teammates]);

  // Checks each of today's jobs for a linked quote that's ready to sign
  // right now. Bounded to a single day's jobs (never the whole
  // appointment history), so this stays a handful of parallel requests,
  // not an N+1 scan of everything - and re-runs whenever the appointment
  // list itself changes (a job getting added/completed can change what
  // "today" contains).
  useEffect(() => {

    const todayJobIds = appointments
      .filter((appt) => toDateKey(new Date(appt.start_time)) === toDateKey(new Date()))
      .filter((appt) => appt.status === "scheduled" || appt.status === "completed")
      .map((appt) => appt.id);

    if (todayJobIds.length === 0) {
      return;
    }

    let cancelled = false;

    Promise.all(

      todayJobIds.map((id) =>
        getQuoteByAppointment(id)
          .then((quote) => [id, quote])
          .catch(() => [id, null])
      )

    ).then((results) => {

      if (cancelled) {
        return;
      }

      const next = {};

      for (const [id, quote] of results) {

        if (quote && quote.status === "sent") {
          next[id] = quote;
        }

      }

      setSignableQuotes(next);

    });

    return () => {
      cancelled = true;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments]);

  const openSignOnSite = (appt) => {

    setSignError("");
    setSignName(appt.customer_name || "");
    setSigningAppt(appt);

    // The pad isn't mounted on this same render (it's gated on
    // signingAppt), same reasoning as Quotes.jsx's own on-site modal.
    requestAnimationFrame(() => signaturePadRef.current?.clear());

  };

  const handleSignOnSite = async () => {

    if (!signingAppt) return;

    const quote = signableQuotes[signingAppt.id];

    if (!quote) return;

    if (!signName.trim()) {
      setSignError("The customer's name is required.");
      return;
    }

    const signature = signaturePadRef.current?.getSignature();

    if (!signature) {
      setSignError("Have the customer sign above first.");
      return;
    }

    setSignSubmitting(true);
    setSignError("");

    try {

      await signQuoteInPerson(quote.id, signName.trim(), signature);

      setSigningAppt(null);
      setActionNote("Signed and marked accepted.");

      setSignableQuotes((prev) => {
        const next = { ...prev };
        delete next[signingAppt.id];
        return next;
      });

    } catch (err) {

      console.error("TODAY SIGN ON-SITE ERROR:", err);
      setSignError(err.message || "Couldn't save that signature. Please try again.");

    } finally {

      setSignSubmitting(false);

    }

  };

  const todayKey = toDateKey(new Date());

  const todaysJobs = appointments
    .filter((appt) => toDateKey(new Date(appt.start_time)) === todayKey)
    .filter((appt) => appt.status === "scheduled" || appt.status === "completed")
    .filter((appt) => scope === "everyone" || appt.assigned_user_id === currentUserId)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  // Real per-technician time tracking (migration 059) - "clocked in"
  // means *I* (the signed-in user) have an open session on this job, not
  // whether anyone at all does. Two teammates can be on the same job
  // independently, each seeing their own button state.
  const isClockedIn = (appt) =>
    (appt.time_entries || []).some((entry) => entry.user_id === currentUserId && !entry.clock_out_at);

  const handleClockToggle = async (appt) => {

    const clockedIn = isClockedIn(appt);

    try {

      setActionError("");
      setClockingId(appt.id);

      if (clockedIn) {
        await clockOutAppointment(appt.id);
      } else {
        await clockInAppointment(appt.id);
      }

      await load();

    } catch (err) {

      console.error("TODAY CLOCK ERROR:", err);
      setActionError("Couldn't update the clock for that job. Please try again.");

    } finally {

      setClockingId(null);

    }

  };

  const handleComplete = async (appt) => {

    try {

      setActionError("");
      setActionNote("");
      setCompletingId(appt.id);

      const result = await updateAppointmentStatus(appt.id, "completed");

      if (result?.draft_invoice_id) {
        setActionNote("Marked done - a draft invoice was created for this job.");
      } else {
        setActionNote("Marked done.");
      }

      await load();

    } catch (err) {

      console.error("TODAY COMPLETE ERROR:", err);
      setActionError("Couldn't mark that job done. Please try again.");

    } finally {

      setCompletingId(null);

    }

  };

  return (

    <div className="p-5 sm:p-8">

      <div className="flex items-center justify-between gap-3">

        <div>

          <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
            <Sun size={26} />
            Today
          </h1>

          <p className="mt-1 text-sm text-fg-faint">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>

        </div>

        <Link
          to="/schedule"
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-fg-muted transition hover:bg-surface-muted hover:text-fg"
        >
          <CalendarDays size={14} />
          Full Schedule
        </Link>

      </div>

      {teammates.length > 1 && (

        <div className="mt-4 flex gap-2">

          <button
            onClick={() => setScope("mine")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${scope === "mine" ? "bg-brand-600 text-white" : "bg-border text-fg-muted hover:bg-border-strong"}`}
          >
            My Jobs
          </button>

          <button
            onClick={() => setScope("everyone")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${scope === "everyone" ? "bg-brand-600 text-white" : "bg-border text-fg-muted hover:bg-border-strong"}`}
          >
            Everyone
          </button>

        </div>

      )}

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
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>

      ) : todaysJobs.length === 0 ? (

        <EmptyState
          icon={Sun}
          title={scope === "mine" ? "Nothing on your schedule today" : "Nothing scheduled today"}
          description="Enjoy the quiet, or head to the full schedule to book something in."
          actionLabel="Open Schedule"
          onAction={() => navigate("/schedule")}
        />

      ) : (

        <div className="mt-6 flex flex-col gap-3">

          {todaysJobs.map((appt) => {

            const clockedIn = isClockedIn(appt);
            const isDone = appt.status === "completed";
            const timeEntrySummary = summarizeTimeEntries(appt.time_entries);

            return (

              <div
                key={appt.id}
                className={`rounded-2xl border p-4 sm:p-5 ${isDone ? "border-border bg-surface-muted/40" : "border-border bg-surface"}`}
              >

                <div className="flex items-start justify-between gap-3">

                  <div className="min-w-0">

                    <p className="flex items-center gap-1.5 text-sm font-semibold text-fg-muted">
                      <Clock size={13} />
                      {formatTime(appt.start_time)}
                    </p>

                    <p className={`mt-0.5 truncate text-lg font-bold ${isDone ? "text-fg-faint line-through" : ""}`}>
                      {appt.title}
                    </p>

                    {appt.customer_name && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-fg-muted">
                        <User size={13} />
                        {appt.customer_name}
                      </p>
                    )}

                  </div>

                  {isDone && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-success/20 px-2.5 py-1 text-xs font-medium text-success">
                      <Check size={12} />
                      Done
                    </span>
                  )}

                  {teammates.length > 1 && scope === "everyone" && appt.assigned_user_id && (
                    <span className="shrink-0 rounded-full bg-border px-2.5 py-1 text-[11px] font-medium text-fg-muted">
                      {teammates.find((t) => t.id === appt.assigned_user_id)?.name || "Assigned"}
                    </span>
                  )}

                </div>

                {appt.has_conflict && (
                  <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-warning/10 px-2.5 py-1.5 text-xs font-medium text-warning">
                    <AlertTriangle size={13} />
                    Overlaps with another job
                  </p>
                )}

                {appt.notes && (
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                    {appt.notes}
                  </p>
                )}

                {timeEntrySummary.some((person) => person.totalMinutes > 0) && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-fg-faint">
                    <Clock size={11} />
                    Logged {timeEntrySummary
                      .filter((person) => person.totalMinutes > 0)
                      .map((person) => (
                        timeEntrySummary.length > 1
                          ? `${formatMinutes(person.totalMinutes)} (${person.user_name || "a teammate"})`
                          : formatMinutes(person.totalMinutes)
                      ))
                      .join(", ")}
                  </p>
                )}

                <div className="mt-3.5 flex flex-wrap items-center gap-2">

                  {appt.customer_phone && (
                    <a
                      href={telHref(appt.customer_phone)}
                      className="flex items-center gap-1.5 rounded-lg bg-border px-3 py-2 text-sm font-medium transition hover:bg-border-strong"
                    >
                      <Phone size={14} />
                      Call
                    </a>
                  )}

                  {appt.customer_address && (
                    <a
                      href={directionsHref(appt.customer_address)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-lg bg-border px-3 py-2 text-sm font-medium transition hover:bg-border-strong"
                    >
                      <MapPin size={14} />
                      Directions
                    </a>
                  )}

                  {appt.customer_id && (
                    <Link
                      to={`/customers/${appt.customer_id}`}
                      className="rounded-lg bg-border px-3 py-2 text-sm font-medium transition hover:bg-border-strong"
                    >
                      View Customer
                    </Link>
                  )}

                  <button
                    onClick={() => setPhotosAppt(appt)}
                    className="flex items-center gap-1.5 rounded-lg bg-border px-3 py-2 text-sm font-medium transition hover:bg-border-strong"
                  >
                    <Camera size={14} />
                    Photos
                  </button>

                  {!isDone && (

                    <button
                      onClick={() => handleClockToggle(appt)}
                      disabled={clockingId === appt.id}
                      className={`ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${clockedIn ? "bg-warning/20 text-warning hover:bg-warning/30" : "bg-border hover:bg-border-strong"}`}
                    >
                      <Clock size={14} />
                      {clockingId === appt.id ? "..." : clockedIn ? "Clock Out" : "Clock In"}
                    </button>

                  )}

                  {signableQuotes[appt.id] && !signableQuotes[appt.id].has_tiers && (

                    <button
                      onClick={() => openSignOnSite(appt)}
                      className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-500"
                    >
                      <PenLine size={14} />
                      Sign On-Site
                    </button>

                  )}

                  {signableQuotes[appt.id]?.has_tiers && (

                    // A "Good/Better/Best" quote needs its own option
                    // picker before signing - this quick view doesn't
                    // have room to build that out, so it points to the
                    // one place that does rather than offering a Sign
                    // On-Site button that would just fail.
                    <Link
                      to={`/quotes?open=${signableQuotes[appt.id].id}`}
                      className="flex items-center gap-1.5 rounded-lg bg-border px-3 py-2 text-sm font-medium text-fg-muted transition hover:bg-border-strong"
                    >
                      <PenLine size={14} />
                      Sign from Quotes
                    </Link>

                  )}

                  {!isDone && (

                    <button
                      onClick={() => handleComplete(appt)}
                      disabled={completingId === appt.id}
                      className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
                    >
                      <Check size={14} />
                      {completingId === appt.id ? "..." : "Mark Done"}
                    </button>

                  )}

                </div>

              </div>

            );

          })}

        </div>

      )}

      {signingAppt && (

        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSigningAppt(null)}
        >

          <div
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="flex items-center justify-between">

              <h3 className="font-display text-lg font-bold">
                Sign On-Site
              </h3>

              <button
                onClick={() => setSigningAppt(null)}
                className="rounded-lg p-1 text-fg-muted hover:bg-surface-muted hover:text-fg"
                aria-label="Close"
              >
                <X size={18} />
              </button>

            </div>

            <p className="mt-1 text-sm text-fg-faint">
              Hand your device to the customer to sign. This marks the quote accepted immediately.
            </p>

            {signError && (
              <p className="mt-3 text-sm text-danger">
                {signError}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-3">

              <input
                placeholder="Customer's full name"
                value={signName}
                onChange={(e) => setSignName(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-muted p-3 text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
              />

              <SignaturePad ref={signaturePadRef} />

              <button
                onClick={handleSignOnSite}
                disabled={signSubmitting}
                className="mt-1 flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
              >
                <PenLine size={16} />
                {signSubmitting ? "Saving..." : "Save Signature"}
              </button>

            </div>

          </div>

        </div>

      )}

      {photosAppt && (

        <JobPhotosModal
          appointmentId={photosAppt.id}
          onClose={() => setPhotosAppt(null)}
        />

      )}

    </div>

  );

}

export default Today;
