const { run } = require("./util");

module.exports = async (db) => {

  // Lets an owner record a payment collected outside Stripe - cash,
  // check, Venmo, a partial payment negotiated over the phone - against
  // an invoice, the same way quote_expenses already lets them log a job
  // cost. Deliberately a separate, parallel mechanism from the existing
  // Stripe-based deposit/full-payment flow rather than a rewrite of it:
  // that flow (deposit_type/deposit_value/deposit_paid_at, markQuotePaid)
  // is already real, tested, working money-handling code, and this adds
  // "one more way to record money received" without touching it.
  await run(db, `
    CREATE TABLE IF NOT EXISTS quote_payments (
      id TEXT PRIMARY KEY,
      quote_id TEXT NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL DEFAULT 'other',
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by_user_id TEXT,
      created_by_name TEXT
    )
  `);

};
