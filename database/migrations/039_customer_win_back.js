const { run } = require("./util");

// Tracks when a win-back draft was last created for this customer, so
// the background job (backend/services/winBackService.js) doesn't
// re-draft one every time it runs - only after the cooldown has passed
// again with still no new activity.
module.exports = async (db) => {

  await run(db, `ALTER TABLE customers ADD COLUMN last_win_back_at DATETIME`);

};
