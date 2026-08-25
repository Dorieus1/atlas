const { run } = require("./util");

// Which team member (users.id) an appointment is assigned to. Nullable -
// an unassigned appointment is a normal, fully-supported state (it means
// "the business" as a whole, undifferentiated resource), not an error
// condition or a state that needs backfilling.
//
// No FK constraint, matching every other *_id column in this table
// (customer_id, created_by_user_id) - this codebase enforces ownership at
// the application layer (see appointmentController's validation of
// assigned_user_id against getUserById(id, business_id)), not via SQLite
// foreign keys.
module.exports = async (db) => {

  await run(db, `ALTER TABLE appointments ADD COLUMN assigned_user_id TEXT`);

};
