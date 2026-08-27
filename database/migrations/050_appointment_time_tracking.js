const { run } = require("./util");

module.exports = async (db) => {

  await run(db, `ALTER TABLE appointments ADD COLUMN clock_in_at DATETIME`);
  await run(db, `ALTER TABLE appointments ADD COLUMN clock_out_at DATETIME`);

  // A single business-wide rate rather than a per-teammate wage - a real
  // per-person payroll rate is a bigger feature (and a much more
  // sensitive one to store) than this first pass is trying to be. This
  // gives an owner a real, if approximate, labor cost instead of the
  // Profit Margin widget silently ignoring labor entirely, which is what
  // it did before this migration.
  await run(db, `ALTER TABLE businesses ADD COLUMN default_hourly_labor_cost REAL`);

};
