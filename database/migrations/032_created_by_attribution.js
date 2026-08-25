const { run } = require("./util");

// Adds "who created this" attribution to customers, appointments, and
// quotes. Two columns per table rather than a live join to `users`:
//
//   created_by_user_id  - nullable TEXT, the creating user's id
//   created_by_name     - nullable TEXT, a SNAPSHOT of that user's name
//                          at the moment the record was created
//
// The name is deliberately denormalized instead of joined live. Removing
// a teammate (authController.removeTeammate) is a hard DELETE of the
// user row, not a deactivation flag - a live join would silently lose
// the attribution the instant that teammate was removed, which defeats
// the point of showing "Added by" at all. Storing the name as it was at
// creation time makes it a permanent record, immune to the user being
// later renamed or removed.
//
// Both columns are NULL for records created with no authenticated staff
// user behind them (the public chat widget, a customer-portal
// self-requested appointment) - that's a legitimate, honest state, not
// an error.
module.exports = async (db) => {

  await run(db, `ALTER TABLE customers ADD COLUMN created_by_user_id TEXT`);
  await run(db, `ALTER TABLE customers ADD COLUMN created_by_name TEXT`);

  await run(db, `ALTER TABLE appointments ADD COLUMN created_by_user_id TEXT`);
  await run(db, `ALTER TABLE appointments ADD COLUMN created_by_name TEXT`);

  await run(db, `ALTER TABLE quotes ADD COLUMN created_by_user_id TEXT`);
  await run(db, `ALTER TABLE quotes ADD COLUMN created_by_name TEXT`);

};
