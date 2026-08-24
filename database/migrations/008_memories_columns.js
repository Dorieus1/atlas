const { run } = require("./util");

module.exports = async (db) => {

  await run(db, "ALTER TABLE memories ADD COLUMN business_id TEXT");
  await run(db, "ALTER TABLE memories ADD COLUMN memory_type TEXT");
  await run(db, "ALTER TABLE memories ADD COLUMN source TEXT");
  await run(db, "ALTER TABLE memories ADD COLUMN importance REAL DEFAULT 0.5");
  await run(db, "ALTER TABLE memories ADD COLUMN updated_at DATETIME");

  // Backfill business_id on any existing memory rows by looking up each
  // memory's customer and copying that customer's business_id onto it.
  await run(db, `
    UPDATE memories
    SET business_id = (
      SELECT customers.business_id
      FROM customers
      WHERE customers.id = memories.customer_id
    )
    WHERE business_id IS NULL
  `);

};
