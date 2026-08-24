const { run } = require("./util");

module.exports = async (db) => {

  await run(db, `ALTER TABLE businesses ADD COLUMN stripe_account_id TEXT`);
  await run(db, `ALTER TABLE businesses ADD COLUMN stripe_onboarded INTEGER DEFAULT 0`);

  await run(db, `ALTER TABLE quotes ADD COLUMN stripe_checkout_session_id TEXT`);
  await run(db, `ALTER TABLE quotes ADD COLUMN paid_at DATETIME`);

};
