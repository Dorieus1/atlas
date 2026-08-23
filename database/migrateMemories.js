const db = require("./db");

db.serialize(() => {

  db.run(`
    ALTER TABLE memories
    ADD COLUMN business_id TEXT
  `, (err) => {

    if (err && !err.message.includes("duplicate column")) {
      console.log(err.message);
    }

  });



  db.run(`
    ALTER TABLE memories
    ADD COLUMN memory_type TEXT
  `, (err) => {

    if (err && !err.message.includes("duplicate column")) {
      console.log(err.message);
    }

  });



  db.run(`
    ALTER TABLE memories
    ADD COLUMN source TEXT
  `, (err) => {

    if (err && !err.message.includes("duplicate column")) {
      console.log(err.message);
    }

  });



  db.run(`
    ALTER TABLE memories
    ADD COLUMN importance REAL DEFAULT 0.5
  `, (err) => {

    if (err && !err.message.includes("duplicate column")) {
      console.log(err.message);
    }

  });



  db.run(`
    ALTER TABLE memories
    ADD COLUMN updated_at DATETIME
  `, (err) => {

    if (err && !err.message.includes("duplicate column")) {
      console.log(err.message);
    }

  });



  // Backfill business_id on any existing memory rows by
  // looking up each memory's customer and copying that
  // customer's business_id onto the memory row.
  db.run(`
    UPDATE memories
    SET business_id = (
      SELECT customers.business_id
      FROM customers
      WHERE customers.id = memories.customer_id
    )
    WHERE business_id IS NULL
  `, (err) => {

    if (err) {
      console.log(err.message);
    } else {
      console.log("Existing memories backfilled with business_id");
    }

  });

});

console.log("Memory table migration complete");
