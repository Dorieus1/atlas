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
  clockInAppointment,
  clockOutAppointment,
  rescheduleAppointment,
  deleteAppointment,
  getCustomers,
  getTeammates,
  getBusinesses
} from "../api/atlasApi";

import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import { formatMinutes, summarizeTimeEntries } from "../utils/duration";


const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_STYLES = {
  requested: "bg-warning/20 text-warning",
  scheduled: "bg-accent-text/20 text-accent-text",
  completed: "bg-success/20 text-success",
  cancelled: "bg-slate-500/20 text-fg-muted"
};

const RECURRENCE_LABELS = {
  weekly: "1 week",
  biweekly: "2 weeks",
  monthly: "1 month",
  quarterly: "3 months",
  annually: "1 year"
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

// Local calendar date, not UTC - sameDay() (just above) already compares
// by local getFullYear/getMonth/getDate, and the month/week grid cells
// are all built from local-midnight Date objects (buildMonthGrid,
// buildWeekGrid), so this needs to agree with those or an appointment
// can end up filed under the wrong grid cell. Using
// date.toISOString().slice(0, 10) here (the original implementation)
// reads the UTC calendar date instead - for any timezone behind UTC, an
// evening appointment's stored UTC start_time can already be on the
// NEXT calendar day, silently shifting it into tomorrow's cell instead
// of the day it was actually booked for.
function toDateKey(date) {

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;

}

// A small, fixed palette rather than anything derived from a teammate's
// own data (there's nothing color-like to derive from) - hashed from
// their id so the SAME teammate always gets the SAME color across
// reloads and regardless of the teammates list's fetch order, without
// needing to persist a color choice anywhere.
const TEAMMATE_COLORS = [
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-fuchsia-500",
  "bg-rose-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-orange-500"
];

function teammateColor(userId) {

  if (!userId) {
    return "bg-slate-600";
  }

  let hash = 0;

  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }

  return TEAMMATE_COLORS[hash % TEAMMATE_COLORS.length];

}


// Sunday of the week containing `date` - matches WEEKDAYS/buildMonthGrid's
// existing Sunday-first convention (JS Date#getDay(), 0 = Sunday).
function getWeekStart(date) {

  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - start.getDay());

  return start;

}


function buildWeekGrid(weekStart) {

  const days = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    days.push(d);
  }

  return days;

}


// Week view's hourly grid needs a shared vertical scale to place each
// appointment at its actual time of day - this is what one hour tall
// looks like on that scale, in pixels.
const WEEK_HOUR_ROW_HEIGHT = 48;

// The New Appointment form has no duration field, so almost nothing here
// ever gets a real end_time. Falling back to the same default the
// backend already uses for conflict detection (appointmentService.js's
// DEFAULT_DURATION_MS) keeps a block's on-screen height consistent with
// what "conflict" actually means server-side.
const DEFAULT_APPOINTMENT_DURATION_MINUTES = 60;

function getAppointmentEnd(appt) {

  if (appt.end_time) {
    return new Date(appt.end_time);
  }

  return new Date(new Date(appt.start_time).getTime() + DEFAULT_APPOINTMENT_DURATION_MINUTES * 60 * 1000);

}

// 7am-7pm covers the large majority of service-business appointments and
// is a reasonable default grid to show even on an empty week. But a real
// appointment outside that window must still be visible rather than
// clipped off the top or bottom - so the range only ever widens to fit
// whatever's actually scheduled that specific week, never shrinks below
// the default.
const DEFAULT_WEEK_GRID_START_HOUR = 7;
const DEFAULT_WEEK_GRID_END_HOUR = 19;

function computeWeekHourRange(weekDays, appointmentsByDay) {

  let startHour = DEFAULT_WEEK_GRID_START_HOUR;
  let endHour = DEFAULT_WEEK_GRID_END_HOUR;

  weekDays.forEach((day) => {

    const key = toDateKey(day);

    (appointmentsByDay[key] || []).forEach((appt) => {

      const start = new Date(appt.start_time);
      const end = getAppointmentEnd(appt);

      startHour = Math.min(startHour, start.getHours());

      // A late-starting appointment's own start hour must always fall
      // within range, regardless of where its end time lands - an
      // appointment starting at 11:30pm with the default 60-minute
      // duration (there's no duration field on the New Appointment form,
      // so this is common) ends at 12:30am the NEXT calendar day.
      // end.getHours() is then 0, which never pulls endHour up, and
      // startHour only ever moves earlier - so without this, the
      // appointment's start position would land far below the bottom of
      // a grid that never grew to contain it.
      endHour = Math.max(
        endHour,
        end.getMinutes() > 0 ? end.getHours() + 1 : end.getHours(),
        start.getHours() + 1
      );

    });

  });

  return { startHour, endHour: Math.max(endHour, startHour + 1) };

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
  // Two independent flags, not one shared error string set by both -
  // getCustomers() and getTeammates() run in parallel with nothing
  // guaranteeing which settles last, so a shared string risked a late
  // SUCCESS on one silently clearing an earlier FAILURE reported by the
  // other.
  const [customersLoadFailed, setCustomersLoadFailed] = useState(false);
  const [teammatesLoadFailed, setTeammatesLoadFailed] = useState(false);
  const [clockingId, setClockingId] = useState(null);
  const [timeTrackingEnabled, setTimeTrackingEnabled] = useState(true);

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

  // "month" (the original grid) or "week" (a 7-day agenda side by side) -
  // week is the better default for actually planning the next few days,
  // month for seeing the shape of a whole month at a glance. Both share
  // the same selectedDate/day-detail panel and the same drag-to-
  // reschedule mechanism below.
  const [calendarView, setCalendarView] = useState("month");
  const [viewWeekStart, setViewWeekStart] = useState(() => getWeekStart(linkedDate || new Date()));

  const [showForm, setShowForm] = useState(false);

  const [formTitle, setFormTitle] = useState("");
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formAssignedUserId, setFormAssignedUserId] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("09:00");
  // Every appointment used to be created with end_time left null, even
  // though the backend has always accepted one (createAppointment's 5th
  // param) - that silently gave every job the same 60-minute default for
  // conflict detection (DEFAULT_DURATION_MS in appointmentService.js) and
  // the Week view's block height, regardless of whether it was really a
  // 30-minute inspection or a 4-hour install. Defaulting this to 60
  // keeps today's behavior unchanged unless the owner picks something
  // else.
  const [formDurationMinutes, setFormDurationMinutes] = useState(60);
  const [formNotes, setFormNotes] = useState("");
  const [formRecurrence, setFormRecurrence] = useState("none");
  const [formOccurrences, setFormOccurrences] = useState(4);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const [draggedAppointmentId, setDraggedAppointmentId] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);
  const [reschedulingId, setReschedulingId] = useState(null);

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

    // A real error state, not just a console.error - a failed fetch
    // here used to render exactly like "you have no customers/teammates
    // yet" (an empty picker in the New Appointment form and the
    // assignee dropdowns), indistinguishable from a genuine empty
    // state.
    getCustomers()
      .then((data) => {
        setCustomers(data);
        setCustomersLoadFailed(false);
      })
      .catch((error) => {
        console.error("CUSTOMERS LOAD ERROR:", error);
        setCustomersLoadFailed(true);
      });

    getTeammates()
      .then((data) => {
        setTeammates(data);
        setTeammatesLoadFailed(false);
      })
      .catch((error) => {
        console.error("TEAMMATES LOAD ERROR:", error);
        setTeammatesLoadFailed(true);
      });

    getBusinesses()
      .then((businesses) => setTimeTrackingEnabled(businesses?.[0]?.time_tracking_enabled !== 0))
      .catch((error) => console.error("SCHEDULE BUSINESS LOAD ERROR:", error));

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
    setFormDurationMinutes(60);
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
      const endTime = new Date(new Date(startTime).getTime() + Number(formDurationMinutes) * 60 * 1000).toISOString();

      await createAppointment(
        formCustomerId || null,
        formTitle.trim(),
        formNotes.trim() || null,
        startTime,
        endTime,
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

      await loadAppointments();

    } catch (error) {

      console.error("CLOCK IN/OUT ERROR:", error);
      setActionError("Couldn't update the clock for that appointment. Please try again.");

    } finally {

      setClockingId(null);

    }

  };


  // Drag-to-reschedule: drops an appointment onto a different day cell in
  // the month grid. Keeps the original time-of-day and duration, only the
  // calendar date changes - dragging is a spatial "move this to that day"
  // gesture, not a way to also retype the time, which the existing Edit
  // form already covers.
  const handleDropOnDay = async (targetDay) => {

    const appointmentId = draggedAppointmentId;

    setDraggedAppointmentId(null);
    setDragOverKey(null);

    if (!appointmentId) {
      return;
    }

    const appt = appointments.find((a) => a.id === appointmentId);

    if (!appt) {
      return;
    }

    const originalStart = new Date(appt.start_time);

    const newStart = new Date(
      targetDay.getFullYear(),
      targetDay.getMonth(),
      targetDay.getDate(),
      originalStart.getHours(),
      originalStart.getMinutes(),
      originalStart.getSeconds()
    );

    // Dropped back on the day it already lived on - nothing to do.
    if (sameDay(newStart, originalStart)) {
      return;
    }

    setReschedulingId(appointmentId);
    setActionError("");

    try {

      await rescheduleAppointment(appointmentId, newStart.toISOString());
      await loadAppointments();

    } catch (error) {

      console.error("RESCHEDULE APPOINTMENT ERROR:", error);
      setActionError("Couldn't reschedule that appointment. Please try again.");

    } finally {

      setReschedulingId(null);

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
  const weekDays = buildWeekGrid(viewWeekStart);
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

  const { startHour: weekGridStartHour, endHour: weekGridEndHour } = computeWeekHourRange(weekDays, appointmentsByDay);
  const weekGridHours = Array.from({ length: weekGridEndHour - weekGridStartHour }, (_, i) => weekGridStartHour + i);
  const weekGridHeight = (weekGridEndHour - weekGridStartHour) * WEEK_HOUR_ROW_HEIGHT;


  return (

    <div className="p-8">

      <div className="flex flex-wrap items-center justify-between gap-3">

        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <CalendarDays size={28} />
            Schedule
          </h1>
          <p className="mt-1 text-sm text-fg-faint">
            Every job and appointment, at a glance.
          </p>
        </div>

        <div className="flex items-center gap-2">

          {teammates.length > 1 && (
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              aria-label="Filter by assignee"
              className="rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-sm text-fg focus:border-border-strong focus:outline-none"
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
        <p className="mt-4 text-danger">
          {loadError}
        </p>
      )}

      {(customersLoadFailed || teammatesLoadFailed) && (
        <p className="mt-4 text-danger">
          Couldn't load your {customersLoadFailed && teammatesLoadFailed ? "customers or team" : customersLoadFailed ? "customers" : "team"} - the picker below may be incomplete. Please refresh to try again.
        </p>
      )}

      {actionError && (
        <p className="mt-4 text-danger">
          {actionError}
        </p>
      )}

      {actionSuccess && (
        <p className="mt-4 text-success">
          {actionSuccess.message}{" "}
          {actionSuccess.showQuotesLink && (
            <Link to="/quotes" className="underline hover:text-success/80">
              View it in Quotes
            </Link>
          )}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">

        <div className="rounded-2xl border border-border bg-surface/60 p-5 lg:col-span-8">

          <div className="flex flex-wrap items-center justify-between gap-3">

            <h2 className="font-display text-lg font-semibold">
              {calendarView === "month"
                ? viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })
                : (() => {
                    const weekEnd = weekDays[6];
                    const sameMonth = viewWeekStart.getMonth() === weekEnd.getMonth();
                    const startLabel = viewWeekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                    const endLabel = weekEnd.toLocaleDateString(undefined, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" });
                    return `${startLabel} - ${endLabel}, ${weekEnd.getFullYear()}`;
                  })()}
            </h2>

            <div className="flex items-center gap-3">

              <div className="flex rounded-lg border border-border p-0.5 text-xs font-medium">

                <button
                  onClick={() => setCalendarView("month")}
                  className={`rounded-md px-2.5 py-1 transition ${calendarView === "month" ? "bg-border text-fg" : "text-fg-muted hover:text-fg"}`}
                >
                  Month
                </button>

                <button
                  onClick={() => {
                    setCalendarView("week");
                    setViewWeekStart(getWeekStart(selectedDate));
                  }}
                  className={`rounded-md px-2.5 py-1 transition ${calendarView === "week" ? "bg-border text-fg" : "text-fg-muted hover:text-fg"}`}
                >
                  Week
                </button>

              </div>

              <div className="flex items-center gap-1">

                <button
                  onClick={() => {
                    if (calendarView === "month") {
                      setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
                    } else {
                      setViewWeekStart((prev) => {
                        const next = new Date(prev);
                        next.setDate(prev.getDate() - 7);
                        return next;
                      });
                    }
                  }}
                  className="rounded-lg p-2 text-fg-muted transition hover:bg-surface-muted hover:text-fg"
                  aria-label={calendarView === "month" ? "Previous month" : "Previous week"}
                >
                  <ChevronLeft size={18} />
                </button>

                <button
                  onClick={() => {
                    if (calendarView === "month") {
                      setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));
                    } else {
                      setViewWeekStart((prev) => {
                        const next = new Date(prev);
                        next.setDate(prev.getDate() + 7);
                        return next;
                      });
                    }
                  }}
                  className="rounded-lg p-2 text-fg-muted transition hover:bg-surface-muted hover:text-fg"
                  aria-label={calendarView === "month" ? "Next month" : "Next week"}
                >
                  <ChevronRight size={18} />
                </button>

              </div>

            </div>

          </div>

          {calendarView === "month" && (

            <div className="mt-5 grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-fg-faint">
              {WEEKDAYS.map((day) => (
                <div key={day} className="pb-1">
                  {day}
                </div>
              ))}
            </div>

          )}

          {calendarView === "month" ? (

          <div className="grid grid-cols-7 gap-1.5">

            {monthDays.map((day) => {

              const key = toDateKey(day);
              const dayAppointments = appointmentsByDay[key] || [];
              const isCurrentMonth = day.getMonth() === viewMonth.getMonth();
              const isToday = sameDay(day, today);
              const isSelected = sameDay(day, selectedDate);
              const dayHasConflict = dayAppointments.some((appt) => appt.has_conflict);

              const isDragTarget = dragOverKey === key && draggedAppointmentId;

              return (

                <button
                  key={key}
                  onClick={() => setSelectedDate(day)}
                  onDragOver={(e) => {
                    if (draggedAppointmentId) {
                      e.preventDefault();
                      if (dragOverKey !== key) setDragOverKey(key);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverKey === key) setDragOverKey(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDropOnDay(day);
                  }}
                  className={`
                    relative flex min-h-[76px] flex-col items-start rounded-xl border p-2 text-left transition
                    ${isSelected ? "border-brand-500 bg-brand-600/10" : "border-border hover:border-border-strong hover:bg-surface-muted"}
                    ${isDragTarget ? "border-brand-400 bg-brand-600/20" : ""}
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
                      ${isToday ? "bg-brand-600 text-white" : "text-fg-muted"}
                    `}
                  >
                    {day.getDate()}
                  </span>

                  <div className="mt-1.5 flex w-full flex-col gap-1">

                    {dayAppointments.slice(0, 2).map((appt) => (
                      <span
                        key={appt.id}
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          e.dataTransfer.effectAllowed = "move";
                          setDraggedAppointmentId(appt.id);
                        }}
                        onDragEnd={() => {
                          setDraggedAppointmentId(null);
                          setDragOverKey(null);
                        }}
                        title={appt.assigned_user_id ? teammatesById[appt.assigned_user_id]?.name : "Unassigned"}
                        className={`
                          flex items-center gap-1 truncate rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-fg-muted transition
                          ${reschedulingId === appt.id ? "opacity-50" : "cursor-grab active:cursor-grabbing"}
                        `}
                      >
                        {teammates.length > 1 && (
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${teammateColor(appt.assigned_user_id)}`} />
                        )}
                        <span className="truncate">{appt.title}</span>
                      </span>
                    ))}

                    {dayAppointments.length > 2 && (
                      <span className="text-[10px] text-fg-faint">
                        +{dayAppointments.length - 2} more
                      </span>
                    )}

                  </div>

                </button>

              );

            })}

          </div>

          ) : (

          <div className="mt-1 overflow-x-auto">

            {/*
              Squeezing 7 day columns plus an hour gutter into a phone's
              width makes each column illegibly thin rather than actually
              responsive - below the sm breakpoint this floor gives every
              column a workable width (~85px) and lets the row scroll
              horizontally instead of squishing. The floor drops away at
              sm and up: below lg this card is already full page width
              (the calendar and side panel stack, not sit side by side),
              and at lg+ where they do share a row, natural 1fr sizing
              still gives each column a reasonable ~80px+ - no forced
              scroll needed on an actual desktop-sized panel. Both the
              day-header row and the hourly grid below share this one
              width so they always scroll in sync.
            */}
            <div className="min-w-[640px] sm:min-w-0">

            <div className="grid grid-cols-[3rem_repeat(7,1fr)] gap-1.5">

              <div />

              {weekDays.map((day) => {

                const key = toDateKey(day);
                const dayAppointments = appointmentsByDay[key] || [];
                const isToday = sameDay(day, today);
                const isSelected = sameDay(day, selectedDate);
                const dayHasConflict = dayAppointments.some((appt) => appt.has_conflict);

                return (

                  <button
                    key={key}
                    onClick={() => setSelectedDate(day)}
                    className={`
                      relative flex flex-col items-center rounded-xl border py-1.5 transition
                      ${isSelected ? "border-brand-500 bg-brand-600/10" : "border-border hover:border-border-strong hover:bg-surface-muted"}
                    `}
                  >

                    {dayHasConflict && (
                      <span
                        className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500"
                        aria-label="This day has overlapping appointments"
                      />
                    )}

                    <span className="text-[10px] font-medium text-fg-faint">
                      {WEEKDAYS[day.getDay()]}
                    </span>

                    <span
                      className={`
                        mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium
                        ${isToday ? "bg-brand-600 text-white" : "text-fg-muted"}
                      `}
                    >
                      {day.getDate()}
                    </span>

                  </button>

                );

              })}

            </div>

            <div className="mt-1.5 max-h-[620px] overflow-y-auto rounded-xl border border-border">

              <div
                className="relative grid grid-cols-[3rem_repeat(7,1fr)] gap-1.5 p-1.5"
                style={{ height: weekGridHeight }}
              >

                <div className="relative">

                  {weekGridHours.map((hour) => (

                    <div
                      key={hour}
                      className="absolute right-1.5 -translate-y-1/2 text-[10px] text-fg-faint"
                      style={{ top: (hour - weekGridStartHour) * WEEK_HOUR_ROW_HEIGHT }}
                    >
                      {new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: "numeric" })}
                    </div>

                  ))}

                </div>

                {weekDays.map((day) => {

                  const key = toDateKey(day);
                  const dayAppointments = appointmentsByDay[key] || [];
                  const isToday = sameDay(day, today);
                  const isDragTarget = dragOverKey === key && draggedAppointmentId;
                  const now = new Date();
                  const nowMinutes = (now.getHours() - weekGridStartHour) * 60 + now.getMinutes();
                  const showNowLine = isToday && nowMinutes >= 0 && nowMinutes <= (weekGridEndHour - weekGridStartHour) * 60;

                  return (

                    <div
                      key={key}
                      onClick={() => setSelectedDate(day)}
                      onDragOver={(e) => {
                        if (draggedAppointmentId) {
                          e.preventDefault();
                          if (dragOverKey !== key) setDragOverKey(key);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverKey === key) setDragOverKey(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDropOnDay(day);
                      }}
                      className={`
                        relative cursor-pointer rounded-lg border transition
                        ${isDragTarget ? "border-brand-400 bg-brand-600/20" : "border-border/60 bg-bg/40 hover:bg-surface/60"}
                      `}
                    >

                      {weekGridHours.map((hour, i) => (
                        <div
                          key={hour}
                          className="absolute inset-x-0 border-t border-border/60"
                          style={{ top: i * WEEK_HOUR_ROW_HEIGHT }}
                        />
                      ))}

                      {showNowLine && (
                        <div
                          className="absolute inset-x-0 z-10 h-px bg-red-500"
                          style={{ top: (nowMinutes / 60) * WEEK_HOUR_ROW_HEIGHT }}
                        />
                      )}

                      {dayAppointments.map((appt) => {

                        const start = new Date(appt.start_time);
                        const end = getAppointmentEnd(appt);

                        const startMinutes = (start.getHours() - weekGridStartHour) * 60 + start.getMinutes();
                        const durationMinutes = Math.max((end.getTime() - start.getTime()) / 60000, 15);

                        return (

                          <div
                            key={appt.id}
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              e.dataTransfer.effectAllowed = "move";
                              setDraggedAppointmentId(appt.id);
                            }}
                            onDragEnd={() => {
                              setDraggedAppointmentId(null);
                              setDragOverKey(null);
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDate(day);
                            }}
                            title={appt.assigned_user_id ? teammatesById[appt.assigned_user_id]?.name : "Unassigned"}
                            className={`
                              absolute inset-x-0.5 overflow-hidden rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-fg-muted transition
                              ${reschedulingId === appt.id ? "opacity-50" : "cursor-grab active:cursor-grabbing"}
                            `}
                            style={{
                              top: (startMinutes / 60) * WEEK_HOUR_ROW_HEIGHT,
                              height: (durationMinutes / 60) * WEEK_HOUR_ROW_HEIGHT
                            }}
                          >

                            <span className="flex items-center gap-1">
                              {teammates.length > 1 && (
                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${teammateColor(appt.assigned_user_id)}`} />
                              )}
                              <span className="truncate font-medium">{appt.title}</span>
                            </span>

                            <span className="text-fg-faint">
                              {start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                            </span>

                          </div>

                        );

                      })}

                    </div>

                  );

                })}

              </div>

            </div>

            </div>

          </div>

          )}

        </div>

        <div className="rounded-2xl border border-border bg-surface/60 p-5 lg:col-span-4">

          <h2 className="font-display text-lg font-semibold">
            {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </h2>

          {loading ? (

            <div className="mt-4 flex flex-col gap-3">

              {[0, 1].map((i) => (

                <div key={i} className="rounded-xl border border-border bg-surface-muted p-3.5">
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
              actionLabel="New Appointment"
              onAction={() => openFormForDate(selectedDate)}
            />

          ) : (

            <div className="mt-4 flex flex-col gap-3">

              {selectedDayAppointments.map((appt) => {

                const timeEntrySummary = summarizeTimeEntries(appt.time_entries);
                const clockedIn = isClockedIn(appt);

                return (

                <div
                  key={appt.id}
                  className="rounded-xl border border-border bg-surface-muted p-3.5"
                >

                  <div className="flex items-start justify-between gap-2">

                    <div className="min-w-0">

                      <p className="flex items-center gap-1.5 truncate font-semibold">
                        {teammates.length > 1 && (
                          <span className={`h-2 w-2 shrink-0 rounded-full ${teammateColor(appt.assigned_user_id)}`} />
                        )}
                        {appt.title}
                      </p>

                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted">
                        <Clock size={12} />
                        {new Date(appt.start_time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      </p>

                      {appt.customer_name && (
                        <p className="mt-1 text-xs text-fg-faint">
                          {appt.customer_name}
                        </p>
                      )}

                      {appt.recurrence_id && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-fg-faint">
                          <Repeat size={11} />
                          Repeats {RECURRENCE_LABELS[appt.recurrence_rule] || appt.recurrence_rule}
                        </p>
                      )}

                      {appt.created_by_name && (
                        <p className="mt-1 text-[11px] text-fg-faint">
                          Added by {appt.created_by_name}
                        </p>
                      )}

                      {teammates.length > 1 && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <User size={11} className="shrink-0 text-fg-faint" />
                          <select
                            value={appt.assigned_user_id || ""}
                            onChange={(e) => handleReassign(appt, e.target.value)}
                            aria-label="Assigned to"
                            className="rounded border border-border bg-surface px-1.5 py-0.5 text-[11px] text-fg-muted focus:border-border-strong focus:outline-none"
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
                    <p className="mt-2 text-xs leading-relaxed text-fg-muted">
                      {appt.notes}
                    </p>
                  )}

                  {timeTrackingEnabled && timeEntrySummary.some((person) => person.totalMinutes > 0) && (
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-fg-faint">
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
                          className="rounded-lg bg-border px-2.5 py-1.5 text-xs font-medium transition hover:bg-border-strong"
                        >
                          Decline
                        </button>
                      </>
                    )}

                    {appt.status === "scheduled" && cancelPromptId !== appt.id && (
                      <>
                        {timeTrackingEnabled && (

                          <button
                            onClick={() => handleClockToggle(appt)}
                            disabled={clockingId === appt.id}
                            title={clockedIn ? "Clock out of this job" : "Clock in to this job"}
                            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50 ${clockedIn ? "bg-warning/20 text-warning hover:bg-warning/30" : "bg-border hover:bg-border-strong"}`}
                          >
                            <Clock size={13} />
                            {clockingId === appt.id
                              ? "..."
                              : clockedIn
                                ? "Clock Out"
                                : "Clock In"}
                          </button>

                        )}

                        <button
                          onClick={() => handleStatusChange(appt.id, "completed")}
                          className="flex items-center gap-1 rounded-lg bg-border px-2.5 py-1.5 text-xs font-medium transition hover:bg-border-strong"
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
                          className="rounded-lg bg-border px-2.5 py-1.5 text-xs font-medium transition hover:bg-border-strong"
                        >
                          Cancel
                        </button>
                      </>
                    )}

                    {cancelPromptId === appt.id && (

                      <div className="flex flex-wrap items-center gap-1.5">

                        <span className="text-[11px] text-fg-faint">
                          Cancel:
                        </span>

                        <button
                          onClick={() => handleStatusChange(appt.id, "cancelled", "this")}
                          className="rounded-lg bg-border px-2.5 py-1.5 text-xs font-medium transition hover:bg-border-strong"
                        >
                          This one
                        </button>

                        <button
                          onClick={() => handleStatusChange(appt.id, "cancelled", "future")}
                          className="rounded-lg bg-border px-2.5 py-1.5 text-xs font-medium transition hover:bg-border-strong"
                        >
                          This & future
                        </button>

                        <button
                          onClick={() => setCancelPromptId(null)}
                          className="rounded-lg px-2 py-1.5 text-xs font-medium text-fg-muted transition hover:bg-border"
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
                              className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${deleteScope === "this" ? "bg-brand-600 text-white" : "bg-border text-fg-muted hover:bg-border-strong"}`}
                            >
                              This one
                            </button>

                            <button
                              onClick={() => setDeleteScope("future")}
                              className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${deleteScope === "future" ? "bg-brand-600 text-white" : "bg-border text-fg-muted hover:bg-border-strong"}`}
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
                          className="rounded-lg bg-border px-2.5 py-1.5 text-xs font-medium transition hover:bg-border-strong disabled:opacity-50"
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
                        className="ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
                      >
                        <Trash2 size={13} />
                      </button>

                    )}

                  </div>

                </div>

              );})}

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
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="flex items-center justify-between">

              <h3 className="font-display text-lg font-bold">
                New Appointment
              </h3>

              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg p-1 text-fg-muted hover:bg-surface-muted hover:text-fg"
                aria-label="Close"
              >
                <X size={18} />
              </button>

            </div>

            {formError && (
              <p className="mt-3 text-sm text-danger">
                {formError}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-3">

              <input
                placeholder="Title (e.g. Roof inspection)"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-muted p-3 text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
              />

              <select
                value={formCustomerId}
                onChange={(e) => setFormCustomerId(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-muted p-3 text-fg focus:border-border-strong focus:outline-none"
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
                  className="w-full rounded-lg border border-border bg-surface-muted p-3 text-fg focus:border-border-strong focus:outline-none"
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
                  className="w-full rounded-lg border border-border bg-surface-muted p-3 text-fg focus:border-border-strong focus:outline-none"
                />

                <input
                  type="time"
                  value={formTime}
                  onChange={(e) => setFormTime(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-muted p-3 text-fg focus:border-border-strong focus:outline-none"
                />

              </div>

              <div>
                <label htmlFor="appointment-duration" className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
                  Duration
                </label>
                <select
                  id="appointment-duration"
                  value={formDurationMinutes}
                  onChange={(e) => setFormDurationMinutes(Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-surface-muted p-3 text-fg focus:border-border-strong focus:outline-none"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hours</option>
                  <option value={120}>2 hours</option>
                  <option value={180}>3 hours</option>
                  <option value={240}>4 hours</option>
                  <option value={480}>All day (8 hours)</option>
                </select>
              </div>

              <div className="flex gap-3">

                <select
                  value={formRecurrence}
                  onChange={(e) => setFormRecurrence(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-muted p-3 text-fg focus:border-border-strong focus:outline-none"
                >
                  <option value="none">Does not repeat</option>
                  <option value="weekly">Repeats weekly</option>
                  <option value="biweekly">Repeats every 2 weeks</option>
                  <option value="monthly">Repeats monthly</option>
                  <option value="quarterly">Repeats every 3 months</option>
                  <option value="annually">Repeats annually</option>
                </select>

                {formRecurrence !== "none" && (
                  <input
                    type="number"
                    min="1"
                    max={MAX_RECURRING_OCCURRENCES}
                    value={formOccurrences}
                    onChange={(e) => setFormOccurrences(e.target.value)}
                    placeholder="Times"
                    className="w-28 rounded-lg border border-border bg-surface-muted p-3 text-fg focus:border-border-strong focus:outline-none"
                  />
                )}

              </div>

              {formRecurrence !== "none" && (
                <p className="flex items-center gap-1.5 text-xs text-fg-faint">
                  <Repeat size={12} />
                  Creates {formOccurrences || 0} appointments, {RECURRENCE_LABELS[formRecurrence]} apart (max {MAX_RECURRING_OCCURRENCES}).
                </p>
              )}

              <textarea
                placeholder="Notes (optional)"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                className="h-20 w-full rounded-lg border border-border bg-surface-muted p-3 text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
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
