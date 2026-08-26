const { run } = require("./util");

module.exports = async (db) => {

  // Login/staff tokens are long-lived (7 days, see authController.js's
  // login()) with no revocation mechanism - changing your password used
  // to do nothing to a token that already leaked, which would keep
  // working for the rest of its 7-day life regardless. authMiddleware
  // now rejects any token whose `iat` (issued-at) predates this
  // timestamp, so a password change immediately invalidates every
  // token issued before it. NULL for an account that has never changed
  // its password means no restriction applies yet.
  await run(db, `ALTER TABLE users ADD COLUMN password_changed_at DATETIME`);

};
