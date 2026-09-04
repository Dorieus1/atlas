const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");
const { getAppointmentById } = require("./appointmentService");


const getAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
};

const allAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
};

const runAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });
  });
};


// Real per-technician time tracking (migration 059) - unlike the older
// single clock_in_at/clock_out_at pair that used to live directly on
// appointments, any number of team members can each clock themselves in
// and out of the SAME job independently, so a two-person crew on one
// visit correctly counts as two people's worth of labor, not one.
// Deliberately open to any authenticated team member clocking THEMSELVES
// (not gated on assigned_user_id) - matches the same permission model
// updateAppointmentStatus already uses for completing someone else's
// appointment.
//
// clockInUser always starts a fresh session for this user on this job -
// if their last session on it somehow never got a clock_out_at (an app
// crash mid-shift, say), clocking in again doesn't silently merge into
// that stale one; it's still refused below by "already has an open
// session", the same as the old single-clock behavior refused a double
// clock-in.
const clockInUser = async (appointment_id, business_id, user_id) => {

  const appointment = await getAppointmentById(appointment_id, business_id);

  if (!appointment) {
    return { error: "not_found" };
  }

  // Checked here, not just hidden in the UI - the Settings toggle is the
  // real gate. Clock-OUT is deliberately never blocked this way: turning
  // the feature off mid-shift shouldn't strand whoever's already clocked
  // in with no way to close out their own open session.
  const business = await getAsync(`SELECT time_tracking_enabled FROM businesses WHERE id = ?`, [business_id]);

  if (business && business.time_tracking_enabled === 0) {
    return { error: "time_tracking_disabled" };
  }

  const openEntry = await getAsync(

    `
    SELECT id FROM time_entries
    WHERE appointment_id = ?
    AND user_id = ?
    AND clock_out_at IS NULL
    `,

    [appointment_id, user_id]

  );

  if (openEntry) {
    return { error: "already_clocked_in" };
  }

  const id = uuidv4();
  const clock_in_at = new Date().toISOString();

  await runAsync(

    `
    INSERT INTO time_entries (id, business_id, appointment_id, user_id, clock_in_at)
    VALUES (?, ?, ?, ?, ?)
    `,

    [id, business_id, appointment_id, user_id, clock_in_at]

  );

  return { id, clock_in_at };

};



const clockOutUser = async (appointment_id, business_id, user_id) => {

  const appointment = await getAppointmentById(appointment_id, business_id);

  if (!appointment) {
    return { error: "not_found" };
  }

  const openEntry = await getAsync(

    `
    SELECT * FROM time_entries
    WHERE appointment_id = ?
    AND user_id = ?
    AND clock_out_at IS NULL
    ORDER BY clock_in_at DESC
    LIMIT 1
    `,

    [appointment_id, user_id]

  );

  if (!openEntry) {

    // Distinguishes "never clocked in at all" from "already clocked
    // out" (a closed entry exists, just not an open one) - same two
    // distinct messages the old single-clock version gave, now checked
    // against this user's own history on this job specifically rather
    // than the appointment's one shared pair.
    const anyEntry = await getAsync(

      `SELECT id FROM time_entries WHERE appointment_id = ? AND user_id = ? LIMIT 1`,

      [appointment_id, user_id]

    );

    return { error: anyEntry ? "already_clocked_out" : "not_clocked_in" };

  }

  const clock_out_at = new Date().toISOString();

  if (new Date(clock_out_at) < new Date(openEntry.clock_in_at)) {

    // Clock drift or a stale client - refuse rather than store a
    // negative-duration session that would quietly corrupt the labor
    // cost total.
    return { error: "clock_out_before_clock_in" };

  }

  await runAsync(

    `UPDATE time_entries SET clock_out_at = ? WHERE id = ?`,

    [clock_out_at, openEntry.id]

  );

  return { clock_in_at: openEntry.clock_in_at, clock_out_at };

};



// Bulk fetch for attaching each appointment's own full clock history (to
// GET /api/appointments' response) - one query for the whole list
// instead of one per appointment. User name is joined in directly since
// the frontend needs "who" as much as "when" (Today.jsx shows a
// teammate's own name next to their session).
const getTimeEntriesForAppointmentIds = async (appointmentIds, business_id) => {

  if (appointmentIds.length === 0) {
    return [];
  }

  const placeholders = appointmentIds.map(() => "?").join(", ");

  return allAsync(

    `
    SELECT time_entries.*, users.name AS user_name
    FROM time_entries
    LEFT JOIN users ON users.id = time_entries.user_id
    WHERE time_entries.appointment_id IN (${placeholders})
    AND time_entries.business_id = ?
    ORDER BY time_entries.clock_in_at ASC
    `,

    [...appointmentIds, business_id]

  );

};


// A payroll-style report: for every team member who logged time in
// [start, end] (inclusive, by the calendar day their session started),
// their total completed hours, how many sessions that came from, and
// whether they're still clocked in on something right now (excluded
// from the hours total until it closes, same as analyticsService's
// labor cost - an open session isn't a known quantity yet). Same
// cancelled-appointment exclusion as analyticsService's labor query,
// for the same reason: a job that was called off was never really
// worked, however long someone happened to be clocked in on it first.
const getTimesheetSummary = async (business_id, start, end) => {

  const rows = await allAsync(

    `
    SELECT
      time_entries.user_id,
      users.name AS user_name,
      SUM(
        CASE WHEN time_entries.clock_out_at IS NOT NULL
        THEN (julianday(time_entries.clock_out_at) - julianday(time_entries.clock_in_at)) * 24
        ELSE 0 END
      ) AS hours,
      SUM(CASE WHEN time_entries.clock_out_at IS NOT NULL THEN 1 ELSE 0 END) AS session_count,
      MAX(CASE WHEN time_entries.clock_out_at IS NULL THEN 1 ELSE 0 END) AS has_open_session
    FROM time_entries
    LEFT JOIN users ON users.id = time_entries.user_id
    JOIN appointments ON appointments.id = time_entries.appointment_id
    WHERE time_entries.business_id = ?
    AND appointments.status != 'cancelled'
    AND date(time_entries.clock_in_at) >= date(?)
    AND date(time_entries.clock_in_at) <= date(?)
    GROUP BY time_entries.user_id
    ORDER BY user_name ASC
    `,

    [business_id, start, end]

  );

  return rows.map((row) => {

    // Two different reasons a name can be missing, worth telling apart
    // in a report someone might hand to a bookkeeper: `user_id` itself
    // is null for a pre-migration-059 appointment that never had an
    // assigned_user_id to backfill onto a person (see migration 059);
    // a non-null user_id with no matching name is a teammate who has
    // since been removed from the business - their historical hours
    // stay (this is payroll data, not something a removal should
    // erase), they just can't be named by a live join anymore.
    let user_name = row.user_name;

    if (!user_name) {
      user_name = row.user_id ? "Removed teammate" : "Unassigned";
    }

    return {
      user_id: row.user_id,
      user_name,
      hours: Math.round(row.hours * 100) / 100,
      session_count: row.session_count,
      has_open_session: !!row.has_open_session
    };

  });

};


module.exports = {

  clockInUser,

  clockOutUser,

  getTimeEntriesForAppointmentIds,

  getTimesheetSummary

};
