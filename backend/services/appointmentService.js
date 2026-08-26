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

const RECURRENCE_RULES = new Set(["weekly", "biweekly", "monthly"]);

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
  assigned_user_id

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
        assigned_user_id
      )

      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        assigned_user_id || null

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
  assigned_user_id = null

) => {

  const recurrence_id = uuidv4();

  const durationMs = end_time
    ? new Date(end_time).getTime() - new Date(start_time).getTime()
    : null;

  const ids = [];

  for (let i = 0; i < occurrences; i++) {

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
      assigned_user_id

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

  }

  return { recurrence_id, ids };

};



const getAppointments = (business_id) => {


  return new Promise((resolve, reject) => {


    db.all(

      `
      SELECT
        appointments.*,
        customers.name AS customer_name
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



const deleteAppointment = async (id, business_id) => {

  // Fetched before the DELETE below so google_event_id is still available
  // to push a delete to Google afterward - once the row is gone there's
  // nowhere left to read it from.
  const appt = await getAppointmentById(id, business_id);

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

  if (deleted && appt) {

    // Detached, not awaited - same reasoning as createAppointment.
    pushAppointmentDeleteToGoogle(appt)
      .catch((err) => console.error("GOOGLE CALENDAR SYNC (delete) FAILED:", err));

    pushAppointmentDeleteToApple(appt)
      .catch((err) => console.error("APPLE CALENDAR SYNC (delete) FAILED:", err));

  }

  return deleted;

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
const deleteAppointmentForSeries = async (id, business_id) => {

  const appt = await getAppointmentById(id, business_id);

  if (!appt) {
    return 0;
  }

  if (!appt.recurrence_id) {
    const deleted = await deleteAppointment(id, business_id);
    return deleted ? 1 : 0;
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

  return changes;

};



module.exports = {

  createAppointment,

  createRecurringAppointments,

  getAppointmentById,

  getAppointments,

  getAppointmentsByCustomer,

  updateAppointmentStatus,

  updateAppointmentStatusForSeries,

  deleteAppointment,

  deleteAppointmentForSeries,

  RECURRENCE_RULES,

  MAX_RECURRING_OCCURRENCES

};
