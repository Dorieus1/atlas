const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");


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
  recurrence_rule

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
        recurrence_rule
      )

      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        recurrence_rule || null

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



const createAppointment = (

  business_id,
  customer_id,
  title,
  notes,
  start_time,
  end_time,
  status = "scheduled"

) => {

  return insertAppointmentRow(

    business_id,
    customer_id,
    title,
    notes,
    start_time,
    end_time,
    status,
    null,
    null

  );

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
  occurrences

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

    const id = await insertAppointmentRow(

      business_id,
      customer_id,
      title,
      notes,
      occStart,
      occEnd,
      status,
      recurrence_id,
      recurrence

    );

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



const updateAppointmentStatus = (id, business_id, status) => {


  return new Promise((resolve, reject) => {


    db.run(

      `
      UPDATE appointments
      SET status = ?
      WHERE id = ?
      AND business_id = ?
      `,

      [status, id, business_id],

      function (err) {

        if (err) {

          reject(err);

        } else {

          resolve(this.changes > 0);

        }

      }

    );

  });

};



const deleteAppointment = (id, business_id) => {


  return new Promise((resolve, reject) => {


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

  return new Promise((resolve, reject) => {

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

  return new Promise((resolve, reject) => {

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
