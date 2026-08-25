const { run } = require("./util");

module.exports = async (db) => {

  // Distinguishes the business owner from ordinary staff logins so a
  // handful of clearly-administrative/financial actions (inviting or
  // removing teammates, connecting Stripe, editing the business profile)
  // can be limited to the owner. Every user row that exists before this
  // migration already has full access today, so defaulting to 'owner'
  // here is deliberate - it keeps existing accounts working exactly as
  // they did before this column existed. Newly invited teammates get
  // 'staff' explicitly (see authController.inviteTeammate), not via this
  // column default.
  await run(db, `ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'owner'`);

};
