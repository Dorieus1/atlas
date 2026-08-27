const { run } = require("./util");

module.exports = async (db) => {

  await run(db, `ALTER TABLE businesses ADD COLUMN tour_completed INTEGER DEFAULT 0`);

  // Only a business created AFTER this migration should ever see the new
  // product tour - an existing account (like every business already
  // signed up before this shipped) has already found its way around the
  // app and shouldn't have a "welcome, here's how Atlas works" tour pop
  // up out of nowhere on their next Dashboard visit. Backfilling every
  // row that exists RIGHT NOW to completed, combined with the column's
  // own DEFAULT 0, means only a genuinely new signup (whose INSERT never
  // mentions this column) starts at 0.
  await run(db, `UPDATE businesses SET tour_completed = 1`);

};
