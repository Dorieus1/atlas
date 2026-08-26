const { run } = require("./util");

// Job costing, lite: a flat list of costs (materials, labor, a
// subcontractor invoice) a business logs against a quote/invoice, so
// margin = quote total - expenses is visible without a separate
// accounting tool. Mirrors quote_items' shape and its convention of not
// storing business_id directly - every read/write goes through a lookup
// of the parent quote (which IS scoped to business_id) first, same as
// quote_items already does throughout quoteService.js.
module.exports = async (db) => {

  await run(db, `
    CREATE TABLE IF NOT EXISTS quote_expenses (
      id TEXT PRIMARY KEY,
      quote_id TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

};
