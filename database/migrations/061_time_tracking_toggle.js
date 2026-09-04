const { run } = require("./util");

module.exports = async (db) => {

  // Clock-in/out (migration 059) assumed every business wants their crew
  // punching a clock on each job - true for a roofing or HVAC company
  // with hourly labor, not true for e.g. a solo consultant or a
  // fixed-price contractor who doesn't pay by the hour. Defaults to 1
  // (on) so every existing business keeps behaving exactly as it does
  // today; an owner who has no use for it can turn it off in Settings,
  // which hides the Clock In/Out buttons, the "On The Clock" dashboard
  // panel, and the Timesheets nav link without touching any data already
  // recorded.
  await run(db, `ALTER TABLE businesses ADD COLUMN time_tracking_enabled INTEGER NOT NULL DEFAULT 1`);

};
