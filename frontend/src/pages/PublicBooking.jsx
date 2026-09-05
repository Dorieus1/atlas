import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CalendarDays, Clock, Check, MessageSquare } from "lucide-react";

import { getPublicAvailability, createPublicBooking } from "../api/atlasApi";

import Logo from "../components/Logo";
import Input from "../components/Input";


function formatDayLabel(dateKey) {

  // Parsed as a plain calendar date (no time-of-day, no timezone shift) -
  // this is a date the business's own availability engine already
  // resolved in ITS timezone; re-interpreting the "YYYY-MM-DD" key
  // through the visitor's local timezone here would risk landing on the
  // wrong day for a visitor far from the business's own timezone.
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return {
    weekday: date.toLocaleDateString(undefined, { weekday: "short" }),
    day: date.getDate(),
    month: date.toLocaleDateString(undefined, { month: "short" })
  };

}


function formatSlotTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}


function formatConfirmedTime(iso) {
  return new Date(iso).toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
}


// The no-login self-service booking page - a sibling of PublicChat.jsx
// (same "no session, resolve everything from :slug" shape) but for
// picking a real open slot instead of talking to the AI. Deliberately a
// separate page rather than folded into the chat: this is meant for a
// visitor who already knows what they want and just wants a time on the
// calendar without a conversation.
function PublicBooking() {

  const { slug } = useParams();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [bookingEnabled, setBookingEnabled] = useState(true);
  const [businessName, setBusinessName] = useState("");
  const [days, setDays] = useState([]);
  const [loadError, setLoadError] = useState("");

  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(null);


  const load = () => {

    getPublicAvailability(slug, null, 14)
      .then((data) => {

        setBusinessName(data.businessName);
        setBookingEnabled(data.bookingEnabled);
        setDays(data.days);

        // Land on the first day that actually has something to pick,
        // not necessarily the very first (likely-empty, e.g. a Sunday)
        // day in the range.
        const firstWithSlots = data.days.find((d) => d.slots.length > 0);
        setSelectedDate(firstWithSlots ? firstWithSlots.date : (data.days[0]?.date || null));

        setLoadError("");

      })
      .catch((error) => {

        console.error("PUBLIC AVAILABILITY LOAD ERROR:", error);
        setNotFound(true);

      })
      .finally(() => setLoading(false));

  };

  useEffect(() => {

    load();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);


  const handleSubmit = async () => {

    if (!name.trim()) {
      setSubmitError("Please tell us your name.");
      return;
    }

    if (!selectedSlot) {
      setSubmitError("Please pick a time first.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {

      await createPublicBooking(slug, {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        start_time: selectedSlot,
        notes: notes.trim() || null
      });

      setConfirmed(selectedSlot);

    } catch (error) {

      console.error("PUBLIC BOOKING SUBMIT ERROR:", error);

      // A 409 means someone else took the slot between the page loading
      // and this submit - refresh the real availability rather than
      // just showing an error and leaving a now-stale slot selected.
      if (error.status === 409) {

        setSubmitError("That time was just taken. Please pick another.");
        setSelectedSlot(null);
        load();

      } else {

        setSubmitError(error.message || "Couldn't book that. Please try again.");

      }

    } finally {

      setSubmitting(false);

    }

  };


  if (loading) {

    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="animate-pulse">
          <Logo size={40} />
        </div>
      </div>
    );

  }

  if (notFound) {

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg p-6 text-center">
        <Logo size={40} />
        <h1 className="mt-4 text-xl font-bold">We couldn't find that business</h1>
        <p className="mt-2 text-fg-muted">Double check the link and try again.</p>
      </div>
    );

  }

  if (confirmed) {

    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-4 sm:p-6">

        <div className="w-full max-w-md rounded-2xl border border-border bg-surface/60 p-6 text-center sm:p-8">

          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/20 text-success">
            <Check size={24} />
          </div>

          <h1 className="mt-4 font-display text-xl font-bold">
            You're booked!
          </h1>

          <p className="mt-2 text-fg-muted">
            {formatConfirmedTime(confirmed)}
          </p>

          <p className="mt-4 text-sm text-fg-faint">
            {businessName} will confirm shortly. Keep an eye on your email or phone.
          </p>

        </div>

      </div>

    );

  }

  const selectedDay = days.find((d) => d.date === selectedDate);

  return (

    <div className="flex min-h-screen items-center justify-center bg-bg p-4 sm:p-6">

      <div className="w-full max-w-lg">

        <div className="mb-6 flex flex-col items-center text-center">

          <Logo size={38} />

          <h1 className="mt-3 font-display text-2xl font-bold">
            {businessName}
          </h1>

          <p className="mt-1 text-sm text-fg-faint">
            Book an appointment online, no phone call needed.
          </p>

        </div>

        <div className="rounded-2xl border border-border bg-surface/60 p-5 sm:p-6">

          {loadError && (
            <p className="mb-4 text-sm text-danger">
              {loadError}
            </p>
          )}

          {!bookingEnabled ? (

            <div className="py-6 text-center">

              <CalendarDays size={28} className="mx-auto mb-3 text-fg-faint" />

              <p className="font-medium">
                Online booking isn't set up yet.
              </p>

              <p className="mt-1 text-sm text-fg-faint">
                Reach out directly and {businessName} will get you scheduled.
              </p>

              <Link
                to={`/talk/${slug}`}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500"
              >
                <MessageSquare size={14} />
                Chat With Us Instead
              </Link>

            </div>

          ) : (

            <>

              <div className="flex items-center gap-2 text-sm font-medium text-fg-muted">
                <CalendarDays size={16} className="text-accent-text" />
                Choose a day
              </div>

              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">

                {days.map((d) => {

                  const label = formatDayLabel(d.date);
                  const hasSlots = d.slots.length > 0;

                  return (

                    <button
                      key={d.date}
                      onClick={() => { setSelectedDate(d.date); setSelectedSlot(null); }}
                      disabled={!hasSlots}
                      className={`flex shrink-0 flex-col items-center rounded-xl border px-3 py-2 text-xs transition ${
                        selectedDate === d.date
                          ? "border-brand-500 bg-brand-600/10 text-accent-text"
                          : hasSlots
                            ? "border-border text-fg-muted hover:bg-surface-muted"
                            : "border-border text-fg-faint opacity-40"
                      }`}
                    >
                      <span className="font-medium">{label.weekday}</span>
                      <span className="text-base font-bold">{label.day}</span>
                      <span>{label.month}</span>
                    </button>

                  );

                })}

              </div>

              <div className="mt-5 flex items-center gap-2 text-sm font-medium text-fg-muted">
                <Clock size={16} className="text-accent-text" />
                Choose a time
              </div>

              {selectedDay && selectedDay.slots.length > 0 ? (

                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">

                  {selectedDay.slots.map((iso) => (

                    <button
                      key={iso}
                      onClick={() => setSelectedSlot(iso)}
                      className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                        selectedSlot === iso
                          ? "border-brand-500 bg-brand-600 text-white"
                          : "border-border text-fg-muted hover:bg-surface-muted"
                      }`}
                    >
                      {formatSlotTime(iso)}
                    </button>

                  ))}

                </div>

              ) : (

                <p className="mt-3 text-sm text-fg-faint">
                  Nothing open that day - pick another.
                </p>

              )}

              {selectedSlot && (

                <div className="mt-6 border-t border-border pt-5">

                  {submitError && (
                    <p className="mb-3 text-sm text-danger">
                      {submitError}
                    </p>
                  )}

                  <label htmlFor="booking-name" className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
                    Your Name
                  </label>

                  <Input
                    id="booking-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Homeowner"
                    className="mb-3"
                  />

                  <div className="mb-3 grid gap-3 sm:grid-cols-2">

                    <div>
                      <label htmlFor="booking-email" className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
                        Email
                      </label>
                      <Input
                        id="booking-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                      />
                    </div>

                    <div>
                      <label htmlFor="booking-phone" className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
                        Phone
                      </label>
                      <Input
                        id="booking-phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="(555) 555-5555"
                      />
                    </div>

                  </div>

                  <label htmlFor="booking-notes" className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
                    Anything we should know? (optional)
                  </label>

                  <textarea
                    id="booking-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="mb-4 w-full rounded-lg border border-border bg-surface-muted p-3 text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
                  />

                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
                  >
                    <Check size={16} />
                    {submitting ? "Booking..." : `Book ${formatSlotTime(selectedSlot)}`}
                  </button>

                </div>

              )}

            </>

          )}

        </div>

      </div>

    </div>

  );

}

export default PublicBooking;
