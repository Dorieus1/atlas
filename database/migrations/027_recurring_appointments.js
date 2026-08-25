const { run } = require("./util");

module.exports = async (db) => {

  // recurrence_id links every row generated from one recurring-appointment
  // request (NULL for an ordinary one-off appointment, which is still the
  // overwhelming majority of rows). recurrence_rule records only the
  // interval type ("weekly" / "biweekly" / "monthly") that produced the
  // series - not a full RRULE - since that's all the UI ever offers and
  // all cancel/delete "this and future" needs to know.
  await run(db, `ALTER TABLE appointments ADD COLUMN recurrence_id TEXT`);
  await run(db, `ALTER TABLE appointments ADD COLUMN recurrence_rule TEXT`);

};
