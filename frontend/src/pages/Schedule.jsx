import { useEffect, useState, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  X,
  Check,
  Trash2,
  CalendarDays,
  AlertTriangle,
  Repeat,
  User
} from "lucide-react";

import {
  getAppointments,
  createAppointment,
  updateAppointmentStatus,
  deleteAppointment,
  getCustomers,
  getTeammates
} from "../api/atlasApi";

import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";


const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_STYLES = {
  requested: "bg-amber-500/20 text-amber-400",
  scheduled: "bg-brand-500/20 text-brand-400",
  completed: "bg-green-500/20 text-green-400",
  cancelled: "bg-slate-500/20 text-slate-400"
};

const RECURRENCE_LABELS = {
  weekly: "1 week",
  biweekly: "2 weeks",
  monthly: "1 month"
};

// Kept in sync with MAX_RECURRING_OCCURRENCES in
// backend/services/appointmentService.js.
const MAX_RECURRING_OCCURRENCES = 24;


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

  const [searchParams] = useSearchParams();

  // A search result (or any other deep link) can land here with
  // ?date=YYYY-MM-DD to open straight to that day instead of always
  // defaulting to today.
  const dateParam = searchParams.get("date");
  const linkedDate = dateParam && !Number.isNaN(new Date(dateParam).getTime())
    ? new Date(`${dateParam}T00:00:00`)
    : null;

  const [appointments, setAppointments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [teammates, setTeammates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Who to show appointments for: "all", "unassigned", or a specific
  // teammate's user id. Defaults to "all" and is switched to "just me"
  // below, once the teammate list has loaded, if the signed-in user
  // turns out to be staff (not owner) - see the effect below for why.
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const defaultFilterApplied = useRef(false);

  const currentUserId = (() => {

    try {

      return JSON.parse(localStorage.getItem("user") || "{}").id;

    } catch {

      return null;

    }

  })();

  const [viewMonth, setViewMonth] = useState(() => {
    const now = linkedDate || new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [selectedDate, setSelectedDate] = useState(() => linkedDate || new Date());
  const [showForm, setShowForm] = useState(false);

  const [formTitle, setFormTitle] = useState("");
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formAssignedUserId, setFormAssignedUserId] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("09:00");
  const [formNotes, setFormNotes] = useState("");
  const [formRecurrence, setFormRecurrence] = useState("none");
  const [formOccurrences, setFormOccurrences] = useState(4);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [deleteScope, setDeleteScope] = useState("this");
  const [deletingId, setDeletingId] = useState(null);

  // Which scheduled appointment (if any) is currently showing the
  // "this one" vs "this and future" choice before it gets cancelled.
  const [cancelPromptId, setCancelPromptId] = useState(null);


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

    getTeammates()
      .then(setTeammates)
      .catch((error) => console.error("TEAMMATES LOAD ERROR:", error));

  }, []);


  // A reasonable default for a staff (non-owner) user is "just my jobs" -
  // this is the filter they'll want almost every time they open their
  // schedule. It's only a default, though: the dropdown below still lets
  // any staff member switch to "All" and see the whole team's schedule,
  // it's never hidden from them. Applied exactly once, the first time the
  // teammate list finishes loading, so it never overrides a filter the
  // user has since chosen themselves.
  useEffect(() => {

    if (defaultFilterApplied.current || teammates.length === 0) {
      return;
    }

    defaultFilterApplied.current = true;

    const currentUser = teammates.find((t) => t.id === currentUserId);

    if (currentUser?.role === "staff") {
      setAssigneeFilter(currentUserId);
    }

  }, [teammates, currentUserId]);


  const openFormForDate = (date) => {

    setFormError("");
    setFormTitle("");
    setFormCustomerId("");
    setFormAssignedUserId("");
    setFormNotes("");
    setFormDate(toDateKey(date));
    setFormTime("09:00");
    setFormRecurrence("none");
    setFormOccurrences(4);
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

    const isRecurring = formRecurrence !== "none";
    const occurrenceCount = Number(formOccurrences);

    if (isRecurring && (!Number.isInteger(occurrenceCount) || occurrenceCount < 1)) {
      setFormError("Enter how many times this should repeat.");
      return;
    }

    if (isRecurring && occurrenceCount > MAX_RECURRING_OCCURRENCES) {
      setFormError(`A repeating appointment can't have more than ${MAX_RECURRING_OCCURRENCES} occurrences.`);
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
        null,
        isRecurring ? formRecurrence : undefined,
        isRecurring ? occurrenceCount : undefined,
        formAssignedUserId || null
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


  const handleStatusChange = async (id, status, scope) => {

    try {

      setActionError("");
      setActionSuccess("");
      setCancelPromptId(null);

      const result = await updateAppointmentStatus(id, status, scope);

      if (result?.draft_invoice_id) {
        setActionSuccess({ message: "Marked complete — a draft invoice was created for this job.", showQuotesLink: true });
      } else if (status === "scheduled") {
        setActionSuccess({ message: "Appointment confirmed." });
      } else if (status === "cancelled") {
        setActionSuccess({ message: "Appointment declined." });
      }

      await loadAppointments();

    } catch (error) {

      console.error("UPDATE APPOINTMENT ERROR:", error);
      setActionError("Couldn't update that appointment. Please try again.");

    }

  };


  const handleReassign = async (appt, newAssignedUserId) => {

    try {

      setActionError("");
      // Passing the appointment's own current status keeps this a pure
      // reassignment - the PATCH endpoint always requires a status, but
      // re-sending the one it already has leaves it unchanged.
      await updateAppointmentStatus(appt.id, appt.status, undefined, newAssignedUserId || null);
      await loadAppointments();

    } catch (error) {

      console.error("REASSIGN APPOINTMENT ERROR:", error);
      setActionError("Couldn't reassign that appointment. Please try again.");

    }

  };


  const handleDelete = async (id, scope) => {

    setDeletingId(id);

    try {

      setActionError("");
      await deleteAppointment(id, scope);
      setConfirmingDeleteId(null);
      setDeleteScope("this");
      await loadAppointments();

    } catch (error) {

      console.error("DELETE APPOINTMENT ERROR:", error);
      setActionError("Couldn't remove that appointment. Please try again.");

    } finally {

      setDeletingId(null);

    }

  };


  const monthDays = buildMonthGrid(viewMonth);
  const today = new Date();

  const teammatesById = Object.fromEntries(teammates.map((t) => [t.id, t]));

  const visibleAppointments = appointments.filter((appt) => {

    if (assigneeFilter === "all") {
      return true;
    }

    if (assigneeFilter === "unassigned") {
      return !appt.assigned_user_id;
    }

    return appt.assigned_user_id === assigneeFilter;

  });

  const appointmentsByDay = {};

  visibleAppointments.forEach((appt) => {
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
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <CalendarDays size={28} />
            Schedule
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Every job and appointment, at a glance.
          </p>
        </div>

        <div className="flex items-center gap-2">

          {teammates.length > 1 && (
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              aria-label="Filter by assignee"
              className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-white focus:border-ink-600 focus:outline-none"
            >
              <option value="all">Everyone</option>
              <option value="unassigned">Unassigned</option>
              {teammates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id === currentUserId ? `${t.name} (me)` : t.name}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => openFormForDate(selectedDate)}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500"
          >
            <Plus size={17} />
            New Appointment
          </button>

        </div>

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
          {actionSuccess.message}{" "}
          {actionSuccess.showQuotesLink && (
            <Link to="/quotes" className="underline hover:text-green-300">
              View it in Quotes
            </Link>
          )}
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
              const dayHasConflict = dayAppointments.some((appt) => appt.has_conflict);

              return (

                <button
                  key={key}
                  onClick={() => setSelectedDate(day)}
                  className={`
                    relative flex min-h-[76px] flex-col items-start rounded-xl border p-2 text-left transition
                    ${isSelected ? "border-brand-500 bg-brand-600/10" : "border-ink-700 hover:border-ink-600 hover:bg-ink-800"}
                    ${!isCurrentMonth ? "opacity-40" : ""}
                  `}
                >

                  {dayHasConflict && (
                    <span
                      className="absolute right-2 top-2 h-2 w-2 rounded-full bg-amber-500"
                      aria-label="This day has overlapping appointments"
                    />
                  )}

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
                        title={appt.assigned_user_id ? teammatesById[appt.assigned_user_id]?.name : "Unassigned"}
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

            <div className="mt-4 flex flex-col gap-3">

              {[0, 1].map((i) => (

                <div key={i} className="rounded-xl border border-ink-700 bg-ink-800 p-3.5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="mt-2 h-3 w-1/3" />
                </div>

              ))}

            </div>

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

                      {appt.recurrence_id && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                          <Repeat size={11} />
                          Repeats {RECURRENCE_LABELS[appt.recurrence_rule] || appt.recurrence_rule}
                        </p>
                      )}

                      {appt.created_by_name && (
                        <p className="mt-1 text-[11px] text-slate-500">
                          Added by {appt.created_by_name}
                        </p>
                      )}

                      {teammates.length > 1 && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <User size={11} className="shrink-0 text-slate-500" />
                          <select
                            value={appt.assigned_user_id || ""}
                            onChange={(e) => handleReassign(appt, e.target.value)}
                            aria-label="Assigned to"
                            className="rounded border border-ink-700 bg-ink-900 px-1.5 py-0.5 text-[11px] text-slate-300 focus:border-ink-600 focus:outline-none"
                          >
                            <option value="">Unassigned</option>
                            {teammates.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                    </div>

                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[appt.status]}`}>
                      {appt.status}
                    </span>

                  </div>

                  {appt.has_conflict && (
                    <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-400">
                      <AlertTriangle size={13} />
                      Overlaps with another appointment
                    </p>
                  )}

                  {appt.notes && (
                    <p className="mt-2 text-xs leading-relaxed text-slate-400">
                      {appt.notes}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-2">

                    {appt.status === "requested" && (
                      <>
                        <button
                          onClick={() => handleStatusChange(appt.id, "scheduled")}
                          className="flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-500"
                        >
                          <Check size={13} />
                          Approve
                        </button>

                        <button
                          onClick={() => handleStatusChange(appt.id, "cancelled")}
                          className="rounded-lg bg-ink-700 px-2.5 py-1.5 text-xs font-medium transition hover:bg-ink-600"
                        >
                          Decline
                        </button>
                      </>
                    )}

                    {appt.status === "scheduled" && cancelPromptId !== appt.id && (
                      <>
                        <button
                          onClick={() => handleStatusChange(appt.id, "completed")}
                          className="flex items-center gap-1 rounded-lg bg-ink-700 px-2.5 py-1.5 text-xs font-medium transition hover:bg-ink-600"
                        >
                          <Check size={13} />
                          Done
                        </button>

                        <button
                          onClick={() => {
                            if (appt.recurrence_id) {
                              setCancelPromptId(appt.id);
                            } else {
                              handleStatusChange(appt.id, "cancelled");
                            }
                          }}
                          className="rounded-lg bg-ink-700 px-2.5 py-1.5 text-xs font-medium transition hover:bg-ink-600"
                        >
                          Cancel
                        </button>
                      </>
                    )}

                    {cancelPromptId === appt.id && (

                      <div className="flex flex-wrap items-center gap-1.5">

                        <span className="text-[11px] text-slate-500">
                          Cancel:
                        </span>

                        <button
                          onClick={() => handleStatusChange(appt.id, "cancelled", "this")}
                          className="rounded-lg bg-ink-700 px-2.5 py-1.5 text-xs font-medium transition hover:bg-ink-600"
                        >
                          This one
                        </button>

                        <button
                          onClick={() => handleStatusChange(appt.id, "cancelled", "future")}
                          className="rounded-lg bg-ink-700 px-2.5 py-1.5 text-xs font-medium transition hover:bg-ink-600"
                        >
                          This & future
                        </button>

                        <button
                          onClick={() => setCancelPromptId(null)}
                          className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-ink-700"
                          aria-label="Nevermind"
                        >
                          <X size={13} />
                        </button>

                      </div>

                    )}

                    {confirmingDeleteId === appt.id ? (

                      <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">

                        {appt.recurrence_id && (

                          <div className="flex items-center gap-1.5">

                            <button
                              onClick={() => setDeleteScope("this")}
                              className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${deleteScope === "this" ? "bg-brand-600 text-white" : "bg-ink-700 text-slate-300 hover:bg-ink-600"}`}
                            >
                              This one
                            </button>

                            <button
                              onClick={() => setDeleteScope("future")}
                              className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${deleteScope === "future" ? "bg-brand-600 text-white" : "bg-ink-700 text-slate-300 hover:bg-ink-600"}`}
                            >
                              This & future
                            </button>

                          </div>

                        )}

                        <button
                          onClick={() => handleDelete(appt.id, appt.recurrence_id ? deleteScope : undefined)}
                          disabled={deletingId === appt.id}
                          className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium transition hover:bg-red-500 disabled:opacity-50"
                        >
                          {deletingId === appt.id ? "..." : "Confirm"}
                        </button>

                        <button
                          onClick={() => {
                            setConfirmingDeleteId(null);
                            setDeleteScope("this");
                          }}
                          disabled={deletingId === appt.id}
                          className="rounded-lg bg-ink-700 px-2.5 py-1.5 text-xs font-medium transition hover:bg-ink-600 disabled:opacity-50"
                        >
                          Cancel
                        </button>

                      </div>

                    ) : (

                      <button
                        onClick={() => {
                          setConfirmingDeleteId(appt.id);
                          setDeleteScope("this");
                        }}
                        aria-label="Delete appointment"
                        className="ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10"
                      >
                        <Trash2 size={13} />
                      </button>

                    )}

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

              {teammates.length > 1 && (
                <select
                  value={formAssignedUserId}
                  onChange={(e) => setFormAssignedUserId(e.target.value)}
                  aria-label="Assign to"
                  className="w-full rounded-lg border border-ink-700 bg-ink-800 p-3 text-white focus:border-ink-600 focus:outline-none"
                >
                  <option value="">Unassigned</option>
                  {teammates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}

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

              <div className="flex gap-3">

                <select
                  value={formRecurrence}
                  onChange={(e) => setFormRecurrence(e.target.value)}
                  className="w-full rounded-lg border border-ink-700 bg-ink-800 p-3 text-white focus:border-ink-600 focus:outline-none"
                >
                  <option value="none">Does not repeat</option>
                  <option value="weekly">Repeats weekly</option>
                  <option value="biweekly">Repeats every 2 weeks</option>
                  <option value="monthly">Repeats monthly</option>
                </select>

                {formRecurrence !== "none" && (
                  <input
                    type="number"
                    min="1"
                    max={MAX_RECURRING_OCCURRENCES}
                    value={formOccurrences}
                    onChange={(e) => setFormOccurrences(e.target.value)}
                    placeholder="Times"
                    className="w-28 rounded-lg border border-ink-700 bg-ink-800 p-3 text-white focus:border-ink-600 focus:outline-none"
                  />
                )}

              </div>

              {formRecurrence !== "none" && (
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Repeat size={12} />
                  Creates {formOccurrences || 0} appointments, {RECURRENCE_LABELS[formRecurrence]} apart (max {MAX_RECURRING_OCCURRENCES}).
                </p>
              )}

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
