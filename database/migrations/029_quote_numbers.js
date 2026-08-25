const { run } = require("./util");

module.exports = async (db) => {

  // Per-business counter that hands out sequential quote/invoice numbers.
  // Starts at 1001 (rather than 1) purely for appearances - a business's
  // very first invoice reading "INV-1" looks like a brand-new, untested
  // system, while "INV-1001" reads like an established one. One counter
  // is shared by both quotes and invoices (see quote_number below) rather
  // than keeping two independent sequences, which is simpler to keep
  // correct and matches how most small-business invoicing tools number
  // documents.
  await run(db, `ALTER TABLE businesses ADD COLUMN next_quote_number INTEGER NOT NULL DEFAULT 1001`);

  // The number assigned to this quote/invoice at creation time. Stored as
  // the raw integer, not a pre-formatted "Q-1001"/"INV-1001" string, so
  // the type-prefix/formatting logic can live in one place
  // (formatQuoteNumber in quoteService.js) instead of being baked into
  // stored data.
  await run(db, `ALTER TABLE quotes ADD COLUMN quote_number INTEGER`);

};
