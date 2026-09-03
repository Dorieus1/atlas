const { run } = require("./util");

module.exports = async (db) => {

  // A plan-wide duration (not per-occurrence - every generated visit in
  // one plan is the same length) so createRecurringAppointments can give
  // each occurrence a real end_time instead of none at all. NULL means
  // "no set duration" (today's behavior, unchanged) rather than some
  // arbitrary default - a business that's never cared about this yet
  // shouldn't have every existing plan silently gain a 1-hour block on
  // the calendar it never asked for.
  await run(db, `ALTER TABLE service_agreements ADD COLUMN duration_minutes INTEGER`);

  // Which team member is normally sent for this plan's visits - the same
  // optional, not-role-gated assignment every one-off appointment
  // already supports (appointments.assigned_user_id). NULL means
  // unassigned, exactly like today.
  await run(db, `ALTER TABLE service_agreements ADD COLUMN assigned_user_id TEXT`);

};
