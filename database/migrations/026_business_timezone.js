const { run } = require("./util");

module.exports = async (db) => {

  // Per-business IANA timezone (e.g. "America/New_York"), used to
  // interpret the weekly business_hours (see 025_business_hours.js) in
  // local time instead of raw UTC. NULL means "not set yet" - treated as
  // "UTC" everywhere this is read, which matches the pre-existing
  // behavior for every business created before this column existed.
  await run(db, `ALTER TABLE businesses ADD COLUMN timezone TEXT`);

};
