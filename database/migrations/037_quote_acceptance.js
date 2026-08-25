const { run } = require("./util");

// Two independent-but-related additions to `quotes`, both extending the
// customer-facing portal so a sales cycle can actually close there instead
// of ending with "we sent a quote and waited for a phone call":
//
// 1. Acceptance/decline - a customer can formally say yes/no to a quote
//    that's in status 'sent'. accepted_by_name is a lightweight typed
//    confirmation (NOT a legally-audited e-signature - see
//    portalController.acceptQuote), captured alongside the timestamp so
//    the business can see who approved it, not just that someone did.
//    declined_at has no equivalent "declined_by_name" - a decline isn't
//    an approval record, so there's nothing meaningful to attribute.
//
// 2. An optional deposit - deposit_type/deposit_value follow the exact
//    same nullable, both-or-neither shape as discount_type/discount_value
//    (see 035_quote_discounts.js): 'percent' means deposit_value is a
//    0-100 percentage of the quote's total, 'fixed' means a flat dollar
//    amount. deposit_paid_at is separate from paid_at - a deposit and the
//    eventual full invoice payment are two different Stripe Checkout
//    Sessions and two different events, and a deposit must never be
//    confused with the job being fully paid for.
module.exports = async (db) => {

  await run(db, `ALTER TABLE quotes ADD COLUMN accepted_at DATETIME`);
  await run(db, `ALTER TABLE quotes ADD COLUMN accepted_by_name TEXT`);
  await run(db, `ALTER TABLE quotes ADD COLUMN declined_at DATETIME`);

  await run(db, `ALTER TABLE quotes ADD COLUMN deposit_type TEXT`);
  await run(db, `ALTER TABLE quotes ADD COLUMN deposit_value REAL`);
  await run(db, `ALTER TABLE quotes ADD COLUMN deposit_paid_at DATETIME`);

};
