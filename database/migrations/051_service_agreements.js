const { run } = require("./util");

module.exports = async (db) => {

  // A recurring maintenance/service plan tied to one customer (quarterly
  // pest control, monthly lawn care, etc). Deliberately its own table
  // rather than overloading the existing recurrence_id/recurrence_rule
  // columns on appointments - those describe a single BATCH of rows
  // created together, with no concept of an ongoing relationship that
  // can be paused, cancelled, or topped up with more occurrences later.
  // A service agreement is exactly that longer-lived concept, and it
  // still produces perfectly ordinary appointment rows underneath (see
  // the new service_agreement_id column below) so everything else that
  // already understands appointments - conflict detection, reminders,
  // Google/Apple calendar sync, time tracking - keeps working unmodified.
  await run(db, `
    CREATE TABLE service_agreements (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      title TEXT NOT NULL,
      notes TEXT,
      price REAL,
      frequency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      recurrence_id TEXT,
      start_date DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by_user_id TEXT,
      created_by_name TEXT
    )
  `);

  // Links a generated appointment back to the plan that created it, so
  // completing one can pre-fill its draft invoice from the plan's own
  // price/title instead of the generic $0 placeholder.
  await run(db, `ALTER TABLE appointments ADD COLUMN service_agreement_id TEXT`);

};
