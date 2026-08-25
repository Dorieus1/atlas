const { run } = require("./util");

// A quote/invoice's discount is stored as the raw entered value, not a
// pre-computed dollar amount - discount_type is 'percent' or 'fixed'
// ('percent' means discount_value is a 0-100 percentage, 'fixed' means
// discount_value is a flat dollar amount off). Both columns are nullable
// and null together means "no discount" - this matches the existing
// pattern where a quote's total itself isn't stored but is derived at
// read time from quote_items (see quoteService.js's calculateQuoteTotals),
// so the discount and the total it affects stay computed together in one
// place instead of getting out of sync if line items are edited later.
module.exports = async (db) => {

  await run(db, `ALTER TABLE quotes ADD COLUMN discount_type TEXT`);
  await run(db, `ALTER TABLE quotes ADD COLUMN discount_value REAL`);

};
