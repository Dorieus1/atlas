const { run } = require("./util");

module.exports = async (db) => {

  // A business-wide default tax rate (percentage, e.g. 8.5 for 8.5%) -
  // set once in Settings, applied automatically to new quotes so the
  // owner doesn't have to remember to type it in every time.
  await run(db, `ALTER TABLE businesses ADD COLUMN default_tax_rate REAL`);

  // Snapshotted onto the quote itself at creation time, same reasoning
  // as discount_type/discount_value (035_quote_discounts.js) - if the
  // business's default rate changes later, an already-issued quote's
  // tax must stay exactly what it said at the time, not silently
  // recompute against a rate the customer never saw.
  await run(db, `ALTER TABLE quotes ADD COLUMN tax_rate REAL`);

};
