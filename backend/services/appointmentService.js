const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");

const {
  getBusinessById,
  clearGoogleCalendarConnection,
  clearAppleCalendarConnection
} = require("./businessService");
const { createNotification } = require("./notificationService");

const googleCalendarService = require("./googleCalendarService");
const appleCalendarService = require("./appleCalendarService");


// A revoked/expired refresh token means every future sync will fail the
// exact same way forever until the owner reconnects - silently logging
// each one (the normal best-effort behavior for a one-off Google hiccup)
// would leave the owner believing appointments are syncing when none
// are. Clearing the connection makes every later sync attempt no-op
// immediately (via the google_calendar_connected check each of them
// already does) instead of repeating this same failure, so this only
// ever fires once per revocation.
async function handleGoogleAuthFailure(business_id) {

  try {

    await clearGoogleCalendarConnection(business_id);

    await createNotification(

      business_id,
      "calendar_disconnected",
      "Google Calendar disconnected",
      "Atlas lost access to your Google Calendar, so new appointments won't sync until you reconnect it.",
      "/settings"

    );

  } catch (cleanupError) {

    console.error("GOOGLE CALENDAR AUTH-FAILURE CLEANUP FAILED:", cleanupError);

  }

}


// Same reasoning as handleGoogleAuthFailure - a revoked/rotated Apple
// app-specific password fails identically on every future sync, so
// clearing the connection turns that into a one-time notification
// instead of a silent forever-failure.
async function handleAppleAuthFailure(business_id) {

  try {

    await clearAppleCalendarConnection(business_id);

    await createNotification(

      business_id,
      "calendar_disconnected",
      "Apple Calendar disconnected",
      "Atlas lost access to your Apple Calendar - the app-specific password may have been revoked. Reconnect it to resume syncing.",
      "/settings"

    );

  } catch (cleanupError) {

    console.error("APPLE CALENDAR AUTH-FAILURE CLEANUP FAILED:", cleanupError);

  }

}


// Matches the common calendar-app convention (Google Calendar included)
// of assuming a 1-hour block for an event with no explicit end time -
// most appointments here are created with only a start_time.
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

const CONFLICTABLE_STATUSES = new Set(["scheduled", "requested"]);

const DAY_MS = 24 * 60 * 60 * 1000;

// "quarterly" and "annually" were added for service agreements (see
// serviceAgreementService.js) but work identically for a plain recurring
// appointment too - there's nothing service-agreement-specific about
// them, so they're just two more entries in the one shared set every
// recurrence validation already draws from.
const RECURRENCE_RULES = new Set(["weekly", "biweekly", "monthly", "quarterly", "annually"]);

// One request can never generate more than this many rows - roughly 6
// months of a weekly series or a year of a monthly one. Keeps a single
// mis-click from flooding the appointments table.
const MAX_RECURRING_OCCURRENCES = 24;


// Adds `months` calendar months to `date`, clamped to the last valid day
// of the target month when the original day-of-month doesn't exist there
// (e.g. Jan 31 + 1 month -> Feb 28/29, not Mar 3). Operates in UTC since
// start_time is always stored/passed as an ISO string.
function addMonthsClamped(date, months) {

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  const targetMonthIndex = month + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;

  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);

  return new Date(Date.UTC(
    targetYear,
    targetMonth,
    clampedDay,
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds()
  ));

}


// Returns the ISO start_time for occurrence `index` (0-based, 0 = the
// original) of a recurring series that started at `baseStart`.
function occurrenceStartTime(baseStart, rule, index) {

  const base = new Date(baseStart);

  if (rule === "weekly") {
    return new Date(base.getTime() + index * 7 * DAY_MS).toISOString();
  }

  if (rule === "biweekly") {
    return new Date(base.getTime() + index * 14 * DAY_MS).toISOString();
  }

  if (rule === "monthly") {
    return addMonthsClamped(base, index).toISOString();
  }

  if (rule === "quarterly") {
    return addMonthsClamped(base, index * 3).toISOString();
  }

  if (rule === "annually") {
    return addMonthsClamped(base, index * 12).toISOString();
  }

  throw new Error(`Unknown recurrence rule: ${rule}`);

}


function timeRange(appt) {

  const start = new Date(appt.start_time).getTime();
  const end = appt.end_time ? new Date(appt.end_time).getTime() : start + DEFAULT_DURATION_MS;

  return { start, end };

}


// Flags every appointment that overlaps another *active* one (cancelled
// and completed jobs don't occupy a slot, so they're never considered).
// O(n^2) over the active subset, which is fine at the scale a single
// local business's calendar actually reaches.
//
// Conflicts are scoped per-assignee, not per-business: two appointments
// only count as conflicting if they're assigned to the SAME person, or
// if EITHER one is unassigned. An unassigned appointment still stands in
// for "the business" as one undifferentiated resource, so it conflicts
// with anything else unassigned (or with anyone) at an overlapping time -
// that's what keeps a business that never uses the assignment feature
// seeing identical conflict behavior to before it existed (every
// appointment defaults to unassigned, so every pair is still checked
// exactly as before). Two appointments assigned to two different named
// people never conflict, no matter how much their times overlap.
function attachConflicts(appointments) {

  const active = appointments.filter((appt) => CONFLICTABLE_STATUSES.has(appt.status));

  return appointments.map((appt) => {

    if (!CONFLICTABLE_STATUSES.has(appt.status)) {
      return { ...appt, has_conflict: false };
    }

    const { start, end } = timeRange(appt);

    const conflicts = active.some((other) => {

      if (other.id === appt.id) {
        return false;
      }

      if (
        appt.assigned_user_id &&
        other.assigned_user_id &&
        appt.assigned_user_id !== other.assigned_user_id
      ) {
        return false;
      }

      const otherRange = timeRange(other);

      return start < otherRange.end && otherRange.start < end;

    });

    return { ...appt, has_conflict: conflicts };

  });

}



// Shared by createAppointment (recurrence_id/recurrence_rule always NULL)
// and createRecurringAppointments (one call per generated occurrence).
// Kept private so the existing single-appointment call sites/signature
// never have to change.
function insertAppointmentRow(

  business_id,
  customer_id,
  title,
  notes,
  start_time,
  end_time,
  status,
  recurrence_id,
  recurrence_rule,
  created_by_user_id,
  created_by_name,
  assigned_user_id,
  service_agreement_id = null

) {

  return new Promise((resolve, reject) => {


    const id = uuidv4();


    db.run(

      `
      INSERT INTO appointments
      (
        id,
        business_id,
        customer_id,
        title,
        notes,
        start_time,
        end_time,
        status,
        recurrence_id,
        recurrence_rule,
        created_by_user_id,
        created_by_name,
        assigned_user_id,
        service_agreement_id
      )

      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,

      [

        id,
        business_id,
        customer_id || null,
        title,
        notes || null,
        start_time,
        end_time || null,
        status,
        recurrence_id || null,
        recurrence_rule || null,
        created_by_user_id || null,
        created_by_name || null,
        assigned_user_id || null,
        service_agreement_id || null

      ],

      function (err) {

        if (err) {

          reject(err);

        } else {

          resolve(id);

        }

      }

    );

  });

}



// Records the Google Calendar event id a synced appointment got back, so
// a later status change or delete knows which event to touch.
function setAppointmentGoogleEventId(id, business_id, google_event_id) {

  return new Promise((resolve, reject) => {

    db.run(

      `UPDATE appointments SET google_event_id = ? WHERE id = ? AND business_id = ?`,

      [google_event_id, id, business_id],

      (err) => (err ? reject(err) : resolve())

    );

  });

}



// One-way (Atlas -> Google) best-effort sync, matching the detached
// side-effect discipline chatService.js uses for its own third-party
// calls: every function below is wrapped in its own try/catch, logs on
// failure, and never throws back into the caller - a Google Calendar
// outage or misconfiguration must never affect an appointment create/
// update/delete in the app itself. Each one also no-ops silently when the
// business hasn't connected Google Calendar, so this is a total no-op
// (no extra DB read even) cost for the common case of a business that
// never set this up.
async function pushAppointmentCreateToGoogle(business_id, appointmentId, appointment) {

  try {

    const business = await getBusinessById(business_id);

    if (!business || !business.google_calendar_connected || !business.google_refresh_token) {
      return;
    }

    const googleEventId = await googleCalendarService.createCalendarEvent(

      business.google_refresh_token,
      appointment

    );

    await setAppointmentGoogleEventId(appointmentId, business_id, googleEventId);

  } catch (error) {

    console.error("GOOGLE CALENDAR SYNC (create) FAILED:", error);

    if (error.isAuthError) {
      await handleGoogleAuthFailure(business_id);
    }

  }

}



async function pushAppointmentUpdateToGoogle(appointment) {

  try {

    if (!appointment || !appointment.google_event_id) {
      return;
    }

    const business = await getBusinessById(appointment.business_id);

    if (!business || !business.google_calendar_connected || !business.google_refresh_token) {
      return;
    }

    await googleCalendarService.updateCalendarEvent(

      business.google_refresh_token,
      appointment.google_event_id,
      appointment

    );

  } catch (error) {

    console.error("GOOGLE CALENDAR SYNC (update) FAILED:", error);

    if (error.isAuthError) {
      await handleGoogleAuthFailure(appointment.business_id);
    }

  }

}



async function pushAppointmentDeleteToGoogle(appointment) {

  try {

    if (!appointment || !appointment.google_event_id) {
      return;
    }

    const business = await getBusinessById(appointment.business_id);

    if (!business || !business.google_calendar_connected || !business.google_refresh_token) {
      return;
    }

    await googleCalendarService.deleteCalendarEvent(

      business.google_refresh_token,
      appointment.google_event_id

    );

  } catch (error) {

    console.error("GOOGLE CALENDAR SYNC (delete) FAILED:", error);

    if (error.isAuthError) {
      await handleGoogleAuthFailure(appointment.business_id);
    }

  }

}



// Same one-way, best-effort sync discipline as the Google functions
// above, for Apple Calendar via CalDAV instead. Simpler than Google's
// create/update/delete split: since an Apple event's URL is derived
// deterministically from the appointment's own id (see
// appleCalendarService.js), create and update are the exact same
// operation (CalDAV PUT overwrites in place) and there's no per-
// appointment event id to persist or to gate update/delete on - a
// business that connects Apple Calendar after an appointment already
// exists still syncs it correctly the next time that appointment is
// touched, instead of requiring it to have been created after
// connecting.
async function pushAppointmentCreateToApple(business_id, appointmentId, appointment) {

  try {

    const business = await getBusinessById(business_id);

    if (!business || !business.apple_calendar_connected || !business.apple_calendar_app_password) {
      return;
    }

    await appleCalendarService.upsertCalendarEvent(

      business.apple_calendar_email,
      business.apple_calendar_app_password,
      business.apple_calendar_url,
      { id: appointmentId, ...appointment }

    );

  } catch (error) {

    console.error("APPLE CALENDAR SYNC (create) FAILED:", error);

    if (error.isAuthError) {
      await handleAppleAuthFailure(business_id);
    }

  }

}



async function pushAppointmentUpdateToApple(appointment) {

  try {

    if (!appointment) {
      return;
    }

    const business = await getBusinessById(appointment.business_id);

    if (!business || !business.apple_calendar_connected || !business.apple_calendar_app_password) {
      return;
    }

    await appleCalendarService.upsertCalendarEvent(

      business.apple_calendar_email,
      business.apple_calendar_app_password,
      business.apple_calendar_url,
      appointment

    );

  } catch (error) {

    console.error("APPLE CALENDAR SYNC (update) FAILED:", error);

    if (error.isAuthError) {
      await handleAppleAuthFailure(appointment.business_id);
    }

  }

}



async function pushAppointmentDeleteToApple(appointment) {

  try {

    if (!appointment) {
      return;
    }

    const business = await getBusinessById(appointment.business_id);

    if (!business || !business.apple_calendar_connected || !business.apple_calendar_app_password) {
      return;
    }

    await appleCalendarService.deleteCalendarEvent(

      business.apple_calendar_email,
      business.apple_calendar_app_password,
      business.apple_calendar_url,
      appointment.id

    );

  } catch (error) {

    console.error("APPLE CALENDAR SYNC (delete) FAILED:", error);

    if (error.isAuthError) {
      await handleAppleAuthFailure(appointment.business_id);
    }

  }

}



const createAppointment = async (

  business_id,
  customer_id,
  title,
  notes,
  start_time,
  end_time,
  status = "scheduled",
  created_by_user_id = null,
  created_by_name = null,
  assigned_user_id = null

) => {

  const id = await insertAppointmentRow(

    business_id,
    customer_id,
    title,
    notes,
    start_time,
    end_time,
    status,
    null,
    null,
    created_by_user_id,
    created_by_name,
    assigned_user_id

  );

  // Detached, not awaited - this is a best-effort side effect and must
  // never add Google Calendar's own latency to the response for an
  // appointment that's already successfully saved. The function already
  // has its own internal try/catch and logs on failure; the .catch()
  // here is just a safety net against anything outside that.
  pushAppointmentCreateToGoogle(business_id, id, { title, notes, start_time, end_time })
    .catch((err) => console.error("GOOGLE CALENDAR SYNC (create) FAILED:", err));

  pushAppointmentCreateToApple(business_id, id, { title, notes, start_time, end_time })
    .catch((err) => console.error("APPLE CALENDAR SYNC (create) FAILED:", err));

  return id;

};



// Generates a bounded set of concrete appointment rows for a recurring
// series, all sharing one fresh recurrence_id. Each occurrence is a
// perfectly ordinary appointment row - it flows through conflict
// detection, reminders, and everything else unmodified. Duration (if an
// end_time was given) is preserved per-occurrence rather than shifted by
// a fixed offset, so a monthly series doesn't drift as month lengths
// vary.
//
// Validation of `recurrence` and `occurrences` (including the
// MAX_RECURRING_OCCURRENCES cap) is expected to have already happened
// at the controller level, matching how every other create-appointment
// field is validated before this service is called.
// `startIndex` and `existing_recurrence_id` exist for exactly one caller:
// serviceAgreementService.js's renewal path, which needs to append more
// occurrences to an already-existing series without disturbing the rows
// already created. Every occurrence's date is still computed from the
// SAME original `start_time` (via occurrenceStartTime's index-based
// math) rather than from the last existing occurrence - continuing the
// index sequence instead of restarting it at 0 from a new anchor is what
// keeps a renewed monthly plan landing on the same day-of-month it
// always has, with no drift.
const createRecurringAppointments = async (

  business_id,
  customer_id,
  title,
  notes,
  start_time,
  end_time,
  status,
  recurrence,
  occurrences,
  created_by_user_id = null,
  created_by_name = null,
  assigned_user_id = null,
  service_agreement_id = null,
  startIndex = 0,
  existing_recurrence_id = null

) => {

  const recurrence_id = existing_recurrence_id || uuidv4();

  const durationMs = end_time
    ? new Date(end_time).getTime() - new Date(start_time).getTime()
    : null;

  const ids = [];
  let lastOccStart = null;

  for (let i = startIndex; i < startIndex + occurrences; i++) {

    const occStart = occurrenceStartTime(start_time, recurrence, i);
    const occEnd = durationMs !== null
      ? new Date(new Date(occStart).getTime() + durationMs).toISOString()
      : null;

    // Every occurrence in the series shares the same creator/name and the
    // same assignee - it's one act of scheduling by one person, not N
    // separate ones.
    const id = await insertAppointmentRow(

      business_id,
      customer_id,
      title,
      notes,
      occStart,
      occEnd,
      status,
      recurrence_id,
      recurrence,
      created_by_user_id,
      created_by_name,
      assigned_user_id,
      service_agreement_id

    );

    // Occurrences are independent rows once created, so each one gets its
    // own Google Calendar event - this falls out naturally from being
    // inside the same loop that creates the rows. Detached, not awaited
    // (same reasoning as createAppointment above) - a series of N
    // occurrences must never make the response wait on N sequential
    // Google API round-trips for a side effect that's supposed to be
    // invisible to the caller.
    pushAppointmentCreateToGoogle(business_id, id, { title, notes, start_time: occStart, end_time: occEnd })
      .catch((err) => console.error("GOOGLE CALENDAR SYNC (create) FAILED:", err));

    pushAppointmentCreateToApple(business_id, id, { title, notes, start_time: occStart, end_time: occEnd })
      .catch((err) => console.error("APPLE CALENDAR SYNC (create) FAILED:", err));

    ids.push(id);
    lastOccStart = occStart;

  }

  return { recurrence_id, ids, lastOccurrenceIndex: startIndex + occurrences - 1, lastOccurrenceStart: lastOccStart };

};



// How many occurrences a service agreement has ever generated - counts
// every status (scheduled, completed, even cancelled), not just the
// still-upcoming ones, because this feeds the `startIndex` renewal math
// above, which needs the true count of dates already claimed from the
// plan's original start_time to avoid generating a duplicate date.
const countAppointmentsForServiceAgreement = (service_agreement_id, business_id) => {

  return new Promise((resolve, reject) => {

    db.get(

      `
      SELECT COUNT(*) as count
      FROM appointments
      WHERE service_agreement_id = ?
      AND business_id = ?
      `,

      [service_agreement_id, business_id],

      (err, row) => (err ? reject(err) : resolve(row.count))

    );

  });

};



// Cancelling a plan should stop future visits from showing up on the
// schedule, but must never touch history - a completed visit (and
// whatever invoice it already produced) is a real record of work done,
// not something a cancellation should be able to quietly erase evidence
// of.
//
// A review pass caught a real bug in the comparison below: start_time
// is stored as a JS ISO string ("2026-08-28T09:00:00.000Z"), while raw
// SQLite `datetime('now')` returns its own native format
// ("2026-08-28 09:00:00" - space-separated, no T, no Z). Comparing the
// two directly as strings is wrong for any appointment on the SAME
// calendar day as "now": the first character where they differ is 'T'
// (0x54) vs ' ' (0x20), and since 'T' sorts higher, the ENTIRE
// comparison reads "greater" regardless of what the actual time digits
// say afterward - a visit from nine hours ago, today, was matching
// "start_time > datetime('now')" every bit as much as one nine hours
// from now. Wrapping start_time in datetime(...) too normalizes both
// sides to the same format before comparing (SQLite's datetime()
// happily parses ISO-8601 input), which is what actually fixes it -
// verified directly against the bundled driver, same-day past and
// future timestamps now compare correctly on both sides of the
// boundary.
const cancelFutureServiceAgreementAppointments = (service_agreement_id, business_id) => {

  return new Promise((resolve, reject) => {

    db.run(

      `
      UPDATE appointments
      SET status = 'cancelled'
      WHERE service_agreement_id = ?
      AND business_id = ?
      AND status = 'scheduled'
      AND datetime(start_time) > datetime('now')
      `,

      [service_agreement_id, business_id],

      function (err) {

        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }

      }

    );

  });

};



// Applies an edited plan's title/notes/crew/duration to the visits that
// haven't happened yet - a plan edit is meant to change the real,
// upcoming jobs it's describing, not just future renewals someone might
// click "Add More Visits" on someday. Already-completed or already-
// cancelled visits are left alone (history shouldn't retroactively
// change), and so is anything already in progress or past
// (datetime(start_time) > datetime('now'), same boundary
// cancelFutureServiceAgreementAppointments already uses).
//
// duration_minutes is applied per-row from THAT row's own start_time,
// not copied from a single computed end_time the way a brand-new
// plan's first occurrence is - each future visit already has its own
// (possibly different, e.g. across a DST boundary) start_time, and this
// has to respect that rather than assume they're all identical spacing
// apart.
const updateFutureServiceAgreementAppointments = async (service_agreement_id, business_id, { title, notes, assigned_user_id, duration_minutes }) => {

  const rows = await new Promise((resolve, reject) => {

    db.all(

      `
      SELECT id, start_time
      FROM appointments
      WHERE service_agreement_id = ?
      AND business_id = ?
      AND status = 'scheduled'
      AND datetime(start_time) > datetime('now')
      `,

      [service_agreement_id, business_id],

      (err, rows) => (err ? reject(err) : resolve(rows))

    );

  });

  for (const row of rows) {

    const setClauses = [];
    const values = [];

    if (title !== undefined) {
      setClauses.push("title = ?");
      values.push(title);
    }

    if (notes !== undefined) {
      setClauses.push("notes = ?");
      values.push(notes);
    }

    if (assigned_user_id !== undefined) {
      setClauses.push("assigned_user_id = ?");
      values.push(assigned_user_id);
    }

    if (duration_minutes !== undefined) {

      setClauses.push("end_time = ?");

      values.push(
        duration_minutes
          ? new Date(new Date(row.start_time).getTime() + duration_minutes * 60000).toISOString()
          : null
      );

    }

    if (setClauses.length === 0) {
      continue;
    }

    values.push(row.id);

    await new Promise((resolve, reject) => {

      db.run(

        `UPDATE appointments SET ${setClauses.join(", ")} WHERE id = ?`,

        values,

        (err) => (err ? reject(err) : resolve())

      );

    });

  }

  return rows.length;

};



const getAppointments = (business_id) => {


  return new Promise((resolve, reject) => {


    db.all(

      `
      SELECT
        appointments.*,
        customers.name AS customer_name,
        customers.phone AS customer_phone,
        customers.address AS customer_address
      FROM appointments
      LEFT JOIN customers ON customers.id = appointments.customer_id
      WHERE appointments.business_id = ?
      ORDER BY appointments.start_time ASC
      `,

      [business_id],

      (err, rows) => {

        if (err) {

          reject(err);

        } else {

          resolve(attachConflicts(rows));

        }

      }

    );

  });

};



const getAppointmentsByCustomer = (customer_id, business_id) => {


  return new Promise((resolve, reject) => {


    db.all(

      `
      SELECT *
      FROM appointments
      WHERE customer_id = ?
      AND business_id = ?
      ORDER BY start_time ASC
      `,

      [customer_id, business_id],

      (err, rows) => {

        if (err) {

          reject(err);

        } else {

          resolve(rows);

        }

      }

    );

  });

};



const getAppointmentById = (id, business_id) => {

  return new Promise((resolve, reject) => {

    db.get(

      `
      SELECT *
      FROM appointments
      WHERE id = ?
      AND business_id = ?
      `,

      [id, business_id],

      (err, row) => (err ? reject(err) : resolve(row))

    );

  });

};



// Clock-in/out for real labor-cost tracking (feeds analyticsService's
// margin calculation). Deliberately open to ANY authenticated team
// member, not just the appointment's assigned_user_id - the existing
// updateAppointmentStatus above already lets any team member complete
// someone else's appointment with no ownership check, so restricting
// clock-in/out more tightly than that would be a new, inconsistent rule
// for a v1 that's otherwise matching the existing permission model.
//
// clockIn always (re)starts a fresh session - if the appointment already
// has a clock_out_at from an earlier session (e.g. a job that got
// reopened), clocking in again clears it rather than leaving a stale
// clock-out sitting alongside a brand new clock-in.
const clockIn = async (id, business_id) => {

  const existing = await getAppointmentById(id, business_id);

  if (!existing) {
    return { error: "not_found" };
  }

  if (existing.clock_in_at && !existing.clock_out_at) {
    return { error: "already_clocked_in" };
  }

  const clock_in_at = new Date().toISOString();

  await new Promise((resolve, reject) => {

    db.run(
      `
      UPDATE appointments
      SET clock_in_at = ?, clock_out_at = NULL
      WHERE id = ?
      AND business_id = ?
      `,
      [clock_in_at, id, business_id],
      (err) => (err ? reject(err) : resolve())
    );

  });

  return { clock_in_at };

};



const clockOut = async (id, business_id) => {

  const existing = await getAppointmentById(id, business_id);

  if (!existing) {
    return { error: "not_found" };
  }

  if (!existing.clock_in_at) {
    return { error: "not_clocked_in" };
  }

  if (existing.clock_out_at) {
    return { error: "already_clocked_out" };
  }

  const clock_out_at = new Date().toISOString();

  if (new Date(clock_out_at) < new Date(existing.clock_in_at)) {

    // Clock drift or a stale client - refuse rather than store a
    // negative-duration session that would quietly corrupt the labor
    // cost total.
    return { error: "clock_out_before_clock_in" };

  }

  await new Promise((resolve, reject) => {

    db.run(
      `
      UPDATE appointments
      SET clock_out_at = ?
      WHERE id = ?
      AND business_id = ?
      `,
      [clock_out_at, id, business_id],
      (err) => (err ? reject(err) : resolve())
    );

  });

  return { clock_in_at: existing.clock_in_at, clock_out_at };

};



// `assigned_user_id` is optional and, when omitted (left `undefined`),
// leaves the existing assignment completely untouched - every pre-
// existing caller of this function (including updateAppointmentStatus
// ForSeries' single-row fallback below) only ever passes `status`, so
// this keeps their SQL and behavior byte-for-byte identical. Pass an
// explicit value (a user id, or `null` to unassign) to also reassign the
// appointment as part of the same status update - this is the
// "reassignment" path, reusing the existing PATCH rather than adding a
// new endpoint.
const updateAppointmentStatus = async (id, business_id, status, assigned_user_id) => {

  const reassigning = assigned_user_id !== undefined;

  const updated = await new Promise((resolve, reject) => {


    db.run(

      reassigning
        ? `
          UPDATE appointments
          SET status = ?, assigned_user_id = ?
          WHERE id = ?
          AND business_id = ?
          `
        : `
          UPDATE appointments
          SET status = ?
          WHERE id = ?
          AND business_id = ?
          `,

      reassigning
        ? [status, assigned_user_id, id, business_id]
        : [status, id, business_id],

      function (err) {

        if (err) {

          reject(err);

        } else {

          resolve(this.changes > 0);

        }

      }

    );

  });

  if (updated) {

    // Detached, not awaited - same reasoning as createAppointment.
    getAppointmentById(id, business_id)
      .then((appt) => pushAppointmentUpdateToGoogle(appt))
      .catch((err) => console.error("GOOGLE CALENDAR SYNC (update) FAILED:", err));

    getAppointmentById(id, business_id)
      .then((appt) => pushAppointmentUpdateToApple(appt))
      .catch((err) => console.error("APPLE CALENDAR SYNC (update) FAILED:", err));

  }

  return updated;

};



// Moves a single appointment to a new start_time - the drag-to-
// reschedule action in Schedule.jsx's month view. Deliberately its own
// function rather than folded into updateAppointmentStatus above: that
// one's shape (an optional assigned_user_id that leaves everything else
// untouched when omitted) is already doing one job well, and rescheduling
// has a genuinely different rule to get right - preserving the
// appointment's original duration rather than its clock time. Always
// reschedules just the single row, never a whole recurring series - a
// drag gesture has no natural "and future occurrences too" signal the
// way the explicit cancel/status UI does, so shifting only what was
// actually dragged is the safer default.
const rescheduleAppointment = async (id, business_id, new_start_time) => {

  const existing = await getAppointmentById(id, business_id);

  if (!existing) {
    return false;
  }

  const durationMs = existing.end_time
    ? new Date(existing.end_time).getTime() - new Date(existing.start_time).getTime()
    : null;

  const newEndTime = durationMs !== null
    ? new Date(new Date(new_start_time).getTime() + durationMs).toISOString()
    : null;

  const updated = await new Promise((resolve, reject) => {

    db.run(

      `
      UPDATE appointments
      SET start_time = ?, end_time = ?
      WHERE id = ?
      AND business_id = ?
      `,

      [new_start_time, newEndTime, id, business_id],

      function (err) {

        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }

      }

    );

  });

  if (updated) {

    // Detached, not awaited - same reasoning as updateAppointmentStatus
    // above.
    getAppointmentById(id, business_id)
      .then((appt) => pushAppointmentUpdateToGoogle(appt))
      .catch((err) => console.error("GOOGLE CALENDAR SYNC (reschedule) FAILED:", err));

    getAppointmentById(id, business_id)
      .then((appt) => pushAppointmentUpdateToApple(appt))
      .catch((err) => console.error("APPLE CALENDAR SYNC (reschedule) FAILED:", err));

  }

  return updated;

};



// Returns { error: "not_found" }, { error: "linked_to_plan" }, or
// { deleted: true } - never a bare boolean. A service-agreement-linked
// appointment can never be hard-deleted here: renewServiceAgreement's
// startIndex math (see serviceAgreementService.js) is derived from a
// plain COUNT(*) of that plan's appointment rows, on the reasoning that
// a plan's rows only ever get status-flipped (paused/cancelled), never
// actually removed. A real bug report caught the gap this guard closes
// - hard-deleting one middle visit through this plain endpoint (e.g.
// "customer skipped that week, I'll just delete it," a completely
// normal thing to do from the Schedule page, with no reason to know it
// belongs to a plan) would silently desync that count from the true
// last occurrence index, and the next renewal would generate a
// duplicate appointment on an already-used date - worse, a duplicate
// invoice too, if both got completed. Skipping a single plan visit
// without breaking that invariant is a status change (already
// supported - the existing "Cancel" action marks it cancelled, it
// never deletes the row), so refusing the hard delete here doesn't
// remove any real capability, just steers it through the safe path.
const deleteAppointment = async (id, business_id) => {

  // Fetched before the DELETE below so google_event_id is still available
  // to push a delete to Google afterward - once the row is gone there's
  // nowhere left to read it from.
  const appt = await getAppointmentById(id, business_id);

  if (!appt) {
    return { error: "not_found" };
  }

  if (appt.service_agreement_id) {
    return { error: "linked_to_plan" };
  }

  const deleted = await new Promise((resolve, reject) => {


    db.run(

      `
      DELETE FROM appointments
      WHERE id = ?
      AND business_id = ?
      `,

      [id, business_id],

      function (err) {

        if (err) {

          reject(err);

        } else {

          resolve(this.changes > 0);

        }

      }

    );

  });

  if (deleted) {

    // Detached, not awaited - same reasoning as createAppointment.
    pushAppointmentDeleteToGoogle(appt)
      .catch((err) => console.error("GOOGLE CALENDAR SYNC (delete) FAILED:", err));

    pushAppointmentDeleteToApple(appt)
      .catch((err) => console.error("APPLE CALENDAR SYNC (delete) FAILED:", err));

  }

  return deleted ? { deleted: true } : { error: "not_found" };

};



// "This and all future occurrences" status update. Explicit opt-in only
// - the plain updateAppointmentStatus above (single row) stays the
// default for every existing caller. If the target appointment isn't
// actually part of a series, this degrades to the same single-row
// update, so calling it is always safe even when the caller isn't sure.
const updateAppointmentStatusForSeries = async (id, business_id, status) => {

  const appt = await getAppointmentById(id, business_id);

  if (!appt) {
    return 0;
  }

  if (!appt.recurrence_id) {
    const updated = await updateAppointmentStatus(id, business_id, status);
    return updated ? 1 : 0;
  }

  const changes = await new Promise((resolve, reject) => {

    db.run(

      `
      UPDATE appointments
      SET status = ?
      WHERE business_id = ?
      AND recurrence_id = ?
      AND start_time >= ?
      `,

      [status, business_id, appt.recurrence_id, appt.start_time],

      function (err) {

        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }

      }

    );

  });

  if (changes > 0) {

    const affected = await new Promise((resolve, reject) => {

      db.all(

        `
        SELECT *
        FROM appointments
        WHERE business_id = ?
        AND recurrence_id = ?
        AND start_time >= ?
        `,

        [business_id, appt.recurrence_id, appt.start_time],

        (err, rows) => (err ? reject(err) : resolve(rows))

      );

    });

    // Detached, not awaited - and fired concurrently rather than one at a
    // time, so a "this & future" update on a long series never makes the
    // response wait on N sequential Google API round-trips.
    Promise.all(affected.map((row) => pushAppointmentUpdateToGoogle(row)))
      .catch((err) => console.error("GOOGLE CALENDAR SYNC (series update) FAILED:", err));

    Promise.all(affected.map((row) => pushAppointmentUpdateToApple(row)))
      .catch((err) => console.error("APPLE CALENDAR SYNC (series update) FAILED:", err));

  }

  return changes;

};



// "This and all future occurrences" delete - same opt-in shape as above.
// Returns the same { error } / { deleted: true } shape as deleteAppointment
// above, for the same reason - a plan-generated series must never lose
// rows to a hard delete, or renewServiceAgreement's COUNT(*)-based
// startIndex desyncs from the true last occurrence. Every row in a
// plan's series carries the same service_agreement_id (see
// createRecurringAppointments), so checking the target row alone is
// enough to catch this - there's no case where "this and future" from a
// plan-linked row would sweep in rows that aren't also plan-linked.
const deleteAppointmentForSeries = async (id, business_id) => {

  const appt = await getAppointmentById(id, business_id);

  if (!appt) {
    return { error: "not_found" };
  }

  if (appt.service_agreement_id) {
    return { error: "linked_to_plan" };
  }

  if (!appt.recurrence_id) {
    return deleteAppointment(id, business_id);
  }

  // Fetched before the DELETE below for the same reason as
  // deleteAppointment above - need each row's google_event_id while it
  // still exists.
  const affected = await new Promise((resolve, reject) => {

    db.all(

      `
      SELECT *
      FROM appointments
      WHERE business_id = ?
      AND recurrence_id = ?
      AND start_time >= ?
      `,

      [business_id, appt.recurrence_id, appt.start_time],

      (err, rows) => (err ? reject(err) : resolve(rows))

    );

  });

  const changes = await new Promise((resolve, reject) => {

    db.run(

      `
      DELETE FROM appointments
      WHERE business_id = ?
      AND recurrence_id = ?
      AND start_time >= ?
      `,

      [business_id, appt.recurrence_id, appt.start_time],

      function (err) {

        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }

      }

    );

  });

  if (changes > 0) {

    // Detached, not awaited - and fired concurrently, same reasoning as
    // updateAppointmentStatusForSeries above.
    Promise.all(affected.map((row) => pushAppointmentDeleteToGoogle(row)))
      .catch((err) => console.error("GOOGLE CALENDAR SYNC (series delete) FAILED:", err));

    Promise.all(affected.map((row) => pushAppointmentDeleteToApple(row)))
      .catch((err) => console.error("APPLE CALENDAR SYNC (series delete) FAILED:", err));

  }

  return changes > 0 ? { deleted: true } : { error: "not_found" };

};



module.exports = {

  createAppointment,

  createRecurringAppointments,

  countAppointmentsForServiceAgreement,

  cancelFutureServiceAgreementAppointments,

  updateFutureServiceAgreementAppointments,

  getAppointmentById,

  getAppointments,

  getAppointmentsByCustomer,

  updateAppointmentStatus,

  clockIn,

  clockOut,

  updateAppointmentStatusForSeries,

  rescheduleAppointment,

  deleteAppointment,

  deleteAppointmentForSeries,

  RECURRENCE_RULES,

  MAX_RECURRING_OCCURRENCES

};
