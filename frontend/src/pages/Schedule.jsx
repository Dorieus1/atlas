import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  X,
  Check,
  Trash2,
  CalendarDays
} from "lucide-react";

import {
  getAppointments,
  createAppointment,
  updateAppointmentStatus,
  deleteAppointment,
  getCustomers
} from "../api/atlasApi";

import EmptyState from "../components/EmptyState";


const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_STYLES = {
  scheduled: "bg-brand-500/20 text-brand-400",
  completed: "bg-green-500/20 text-green-400",
  cancelled: "bg-slate-500/20 text-slate-400"
};


function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function buildMonthGrid(monthDate) {

  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();

  const gridStart = new Date(year, month, 1 - startOffset);

  const days = [];

  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }

  return days;

}


function Schedule() {

  const [appointments, setAppointments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [showForm, setShowForm] = useState(false);

  const [formTitle, setFormTitle] = useState("");
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("09:00");
  const [formNotes, setFormNotes] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");


  const loadAppointments = async () => {

    try {

      const data = await getAppointments();
      setAppointments(data);
      setLoadError("");

    } catch (error) {

      console.error("APPOINTMENTS LOAD ERROR:", error);
      setLoadError("Couldn't load your schedule. Please refresh to try again.");

    } finally {

      setLoading(false);

    }

  };


  useEffect(() => {

    loadAppointments();

    getCustomers()
      .then(setCustomers)
      .catch((error) => console.error("CUSTOMERS LOAD ERROR:", error));

  }, []);


  const openFormForDate = (date) => {

    setFormError("");
    setFormTitle("");
    setFormCustomerId("");
    setFormNotes("");
    setFormDate(toDateKey(date));
    setFormTime("09:00");
    setShowForm(true);

  };


  const handleCreate = async () => {

    if (!formTitle.trim()) {
      setFormError("Give the appointment a title.");
      return;
    }

    if (!formDate) {
      setFormError("Pick a date.");
      return;
    }

    if (savingRef.current) {
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setFormError("");

    try {

      const startTime = new Date(`${formDate}T${formTime || "09:00"}:00`).toISOString();

      await createAppointment(
        formCustomerId || null,
        formTitle.trim(),
        formNotes.trim() || null,
        startTime,
        null
      );

      setShowForm(false);
      await loadAppointments();

    } catch (error) {

      console.error("CREATE APPOINTMENT ERROR:", error);
      setFormError(error.message || "Couldn't create that appointment. Please try again.");

    } finally {

      savingRef.current = false;
      setSaving(false);

    }

  };


  const handleStatusChange = async (id, status) => {

    try {

      setActionError("");
      setActionSuccess("");

      const result = await updateAppointmentStatus(id, status);

      if (result?.draft_invoice_id) {
        setActionSuccess("Marked complete — a draft invoice was created for this job.");
      }

      await loadAppointments();

    } catch (error) {

      console.error("UPDATE APPOINTMENT ERROR:", error);
      setActionError("Couldn't update that appointment. Please try again.");

    }

  };


  const handleDelete = async (id) => {

    try {

      setActionError("");
      await deleteAppointment(id);
      await loadAppointments();

    } catch (error) {

      console.error("DELETE APPOINTMENT ERROR:", error);
      setActionError("Couldn't remove that appointment. Please try again.");

    }

  };


  const monthDays = buildMonthGrid(viewMonth);
  const today = new Date();

  const appointmentsByDay = {};

  appointments.forEach((appt) => {
    const key = toDateKey(new Date(appt.start_time));
    if (!appointmentsByDay[key]) {
      appointmentsByDay[key] = [];
    }
    appointmentsByDay[key].push(appt);
  });

  const selectedKey = toDateKey(selectedDate);
  const selectedDayAppointments = (appointmentsByDay[selectedKey] || []).sort(
    (a, b) => new Date(a.start_time) - new Date(b.start_time)
  );


  return (

    <div className="p-8">

      <div className="flex flex-wrap items-center justify-between gap-3">

        <div>
          <h1 className="text-3xl font-bold">
            📅 Schedule
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Every job and appointment, at a glance.
          </p>
        </div>

        <button
          onClick={() => openFormForDate(selectedDate)}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500"
        >
          <Plus size={17} />
          New Appointment
        </button>

      </div>

      {loadError && (
        <p className="mt-4 text-red-400">
          {loadError}
        </p>
      )}

      {actionError && (
        <p className="mt-4 text-red-400">
          {actionError}
        </p>
      )}

      {actionSuccess && (
        <p className="mt-4 text-green-400">
          {actionSuccess}{" "}
          <Link to="/quotes" className="underline hover:text-green-300">
            View it in Quotes
          </Link>
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">

        <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-5 lg:col-span-8">

          <div className="flex items-center justify-between">

            <h2 className="font-display text-lg font-semibold">
              {viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </h2>

            <div className="flex items-center gap-1">

              <button
                onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-ink-800 hover:text-white"
                aria-label="Previous month"
              >
                <ChevronLeft size={18} />
              </button>

              <button
                onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-ink-800 hover:text-white"
                aria-label="Next month"
              >
                <ChevronRight size={18} />
              </button>

            </div>

          </div>

          <div className="mt-5 grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-slate-500">
            {WEEKDAYS.map((day) => (
              <div key={day} className="pb-1">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">

            {monthDays.map((day) => {

              const key = toDateKey(day);
              const dayAppointments = appointmentsByDay[key] || [];
              const isCurrentMonth = day.getMonth() === viewMonth.getMonth();
              const isToday = sameDay(day, today);
              const isSelected = sameDay(day, selectedDate);

              return (

                <button
                  key={key}
                  onClick={() => setSelectedDate(day)}
                  className={`
                    flex min-h-[76px] flex-col items-start rounded-xl border p-2 text-left transition
                    ${isSelected ? "border-brand-500 bg-brand-600/10" : "border-ink-700 hover:border-ink-600 hover:bg-ink-800"}
                    ${!isCurrentMonth ? "opacity-40" : ""}
                  `}
                >

                  <span
                    className={`
                      flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium
                      ${isToday ? "bg-brand-600 text-white" : "text-slate-300"}
                    `}
                  >
                    {day.getDate()}
                  </span>

                  <div className="mt-1.5 flex w-full flex-col gap-1">

                    {dayAppointments.slice(0, 2).map((appt) => (
                      <span
                        key={appt.id}
                        className="truncate rounded bg-ink-800 px-1.5 py-0.5 text-[10px] text-slate-300"
                      >
                        {appt.title}
                      </span>
                    ))}

                    {dayAppointments.length > 2 && (
                      <span className="text-[10px] text-slate-500">
                        +{dayAppointments.length - 2} more
                      </span>
                    )}

                  </div>

                </button>

              );

            })}

          </div>

        </div>

        <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-5 lg:col-span-4">

          <h2 className="font-display text-lg font-semibold">
            {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </h2>

          {loading ? (

            <p className="mt-4 text-sm text-slate-500">
              Loading...
            </p>

          ) : selectedDayAppointments.length === 0 ? (

            <EmptyState
              icon={CalendarDays}
              title="Nothing scheduled"
              description="This day is wide open."
            />

          ) : (

            <div className="mt-4 flex flex-col gap-3">

              {selectedDayAppointments.map((appt) => (

                <div
                  key={appt.id}
                  className="rounded-xl border border-ink-700 bg-ink-800 p-3.5"
                >

                  <div className="flex items-start justify-between gap-2">

                    <div className="min-w-0">

                      <p className="truncate font-semibold">
                        {appt.title}
                      </p>

                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                        <Clock size={12} />
                        {new Date(appt.start_time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      </p>

                      {appt.customer_name && (
                        <p className="mt-1 text-xs text-slate-500">
                          {appt.customer_name}
                        </p>
                      )}

                    </div>

                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[appt.status]}`}>
                      {appt.status}
                    </span>

                  </div>

                  {appt.notes && (
                    <p className="mt-2 text-xs leading-relaxed text-slate-400">
                      {appt.notes}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-2">

                    {appt.status === "scheduled" && (
                      <>
                        <button
                          onClick={() => handleStatusChange(appt.id, "completed")}
                          className="flex items-center gap-1 rounded-lg bg-ink-700 px-2.5 py-1.5 text-xs font-medium transition hover:bg-ink-600"
                        >
                          <Check size={13} />
                          Done
                        </button>

                        <button
                          onClick={() => handleStatusChange(appt.id, "cancelled")}
                          className="rounded-lg bg-ink-700 px-2.5 py-1.5 text-xs font-medium transition hover:bg-ink-600"
                        >
                          Cancel
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => handleDelete(appt.id)}
                      className="ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10"
                    >
                      <Trash2 size={13} />
                    </button>

                  </div>

                </div>

              ))}

            </div>

          )}

        </div>

      </div>

      {showForm && (

        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowForm(false)}
        >

          <div
            className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="flex items-center justify-between">

              <h3 className="font-display text-lg font-bold">
                New Appointment
              </h3>

              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-ink-800 hover:text-white"
                aria-label="Close"
              >
                <X size={18} />
              </button>

            </div>

            {formError && (
              <p className="mt-3 text-sm text-red-400">
                {formError}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-3">

              <input
                placeholder="Title (e.g. Roof inspection)"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full rounded-lg border border-ink-700 bg-ink-800 p-3 text-white placeholder:text-slate-500 focus:border-ink-600 focus:outline-none"
              />

              <select
                value={formCustomerId}
                onChange={(e) => setFormCustomerId(e.target.value)}
                className="w-full rounded-lg border border-ink-700 bg-ink-800 p-3 text-white focus:border-ink-600 focus:outline-none"
              >
                <option value="">No customer linked</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <div className="flex gap-3">

                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full rounded-lg border border-ink-700 bg-ink-800 p-3 text-white focus:border-ink-600 focus:outline-none"
                />

                <input
                  type="time"
                  value={formTime}
                  onChange={(e) => setFormTime(e.target.value)}
                  className="w-full rounded-lg border border-ink-700 bg-ink-800 p-3 text-white focus:border-ink-600 focus:outline-none"
                />

              </div>

              <textarea
                placeholder="Notes (optional)"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                className="h-20 w-full rounded-lg border border-ink-700 bg-ink-800 p-3 text-white placeholder:text-slate-500 focus:border-ink-600 focus:outline-none"
              />

              <button
                onClick={handleCreate}
                disabled={saving}
                className="mt-1 rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
              >
                {saving ? "Scheduling..." : "Schedule Appointment"}
              </button>

            </div>

          </div>

        </div>

      )}

    </div>

  );

}

export default Schedule;
