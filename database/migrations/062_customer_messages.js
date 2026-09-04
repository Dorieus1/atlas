const { run } = require("./util");

module.exports = async (db) => {

  // A review finding: the only "message a customer" UI in the whole app
  // (the in-CRM "Test Atlas" chat box, before it was relabeled/locked
  // down to a preview-only tool) actually let an owner impersonate the
  // CUSTOMER talking to the AI, not send the customer anything - there
  // was never a real "send this person an email as yourself" feature
  // anywhere in the product. This table backs that real feature:
  // customerMessageService.js sends a real email (via the existing
  // Resend integration) and records it here so it shows up in that
  // customer's own Activity Timeline, the same way a note or an
  // appointment does - not a fire-and-forget action with no record.
  await run(db, `
    CREATE TABLE customer_messages (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      sent_by_user_id TEXT,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // sent_by_user_id is nullable for the same reason time_entries.user_id
  // is (see migration 059) - nothing currently deletes a user, but this
  // table's integrity shouldn't depend on that staying true forever.
  await run(db, `
    CREATE INDEX idx_customer_messages_customer_id
    ON customer_messages(customer_id)
  `);

  await run(db, `
    CREATE INDEX idx_customer_messages_business_id
    ON customer_messages(business_id)
  `);

};
