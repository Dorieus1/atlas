const { run } = require("./util");

module.exports = async (db) => {

  // A business-level catalog of reusable quote/invoice line items (e.g.
  // "Roof inspection - $150") so the quote builder can quick-fill a line
  // item instead of the description/price being retyped every time. Scoped
  // to business_id, not quote_id - these rows are templates, independent
  // of any one quote. Copying a saved item into a quote creates a normal
  // quote_items row; nothing links back here, so editing or deleting a
  // saved item never touches quotes that were built from it earlier.
  await run(db, `
    CREATE TABLE IF NOT EXISTS saved_line_items (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      description TEXT NOT NULL,
      unit_price REAL NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

};
