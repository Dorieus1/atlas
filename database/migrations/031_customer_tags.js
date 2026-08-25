const { run } = require("./util");

module.exports = async (db) => {

  // A business-level catalog of reusable tag names (e.g. "VIP",
  // "Recurring", "Needs follow-up") so customers can be segmented
  // consistently. Tag names live here once per business - not typed
  // freestyle per customer - so filtering isn't fragmented by "VIP" vs
  // "vip" vs "Vip" being entered inconsistently.
  await run(db, `
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Join table linking customers to tags (many-to-many - a customer can
  // carry multiple tags, a tag can sit on multiple customers). business_id
  // is denormalized onto this row too, matching how other child tables in
  // this codebase store business_id directly rather than requiring a join
  // back to the parent just to scope or enforce tenant isolation.
  await run(db, `
    CREATE TABLE IF NOT EXISTS customer_tags (
      customer_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      business_id TEXT NOT NULL,
      PRIMARY KEY (customer_id, tag_id)
    )
  `);

};
