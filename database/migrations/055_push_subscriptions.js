const { run } = require("./util");

module.exports = async (db) => {

  // One row per browser/device that's opted in to push notifications -
  // deliberately NOT one-per-business-owner. Notifications themselves
  // (the `notifications` table) are already business-wide, not per-user
  // (every team member sees the same bell icon feed), so push follows
  // the same model: whichever devices on this business have subscribed
  // all get pushed the same real-time alert, regardless of which
  // specific person enabled it on which device. user_id is kept for
  // bookkeeping (an "unsubscribe my devices" path could use it later),
  // not as the fan-out key.
  await run(db, `
    CREATE TABLE push_subscriptions (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // A browser's own push subscription endpoint is already a unique
  // identifier for "this device, this browser" - re-subscribing (e.g.
  // the same device enabling notifications again after clearing them)
  // should update the existing row, never create a duplicate that would
  // otherwise get pushed to twice.
  await run(db, `
    CREATE UNIQUE INDEX idx_push_subscriptions_endpoint
    ON push_subscriptions(endpoint)
  `);

  await run(db, `
    CREATE INDEX idx_push_subscriptions_business_id
    ON push_subscriptions(business_id)
  `);

};
