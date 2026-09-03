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


module.exports = {

  clockInUser,

  clockOutUser,

  getTimeEntriesForAppointmentIds

};
