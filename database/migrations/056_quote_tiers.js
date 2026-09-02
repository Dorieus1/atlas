const { run } = require("./util");

module.exports = async (db) => {

  // "Good/Better/Best" multi-option quotes: a quote can now offer the
  // customer 2+ packages to choose from instead of one flat price. Each
  // tier is its own named option (e.g. "Good", "Better", "Best") with
  // its own line items; quote_items.tier_id (added below) is NULL for
  // items shared across every tier (a common inspection fee, say) and
  // set for items that belong to just one tier. A quote with zero rows
  // here behaves exactly as it always has - this is fully additive,
  // nothing about a plain single-price quote changes.
  await run(db, `
    CREATE TABLE quote_tiers (
      id TEXT PRIMARY KEY,
      quote_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_recommended INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(db, `
    CREATE INDEX idx_quote_tiers_quote_id
    ON quote_tiers(quote_id)
  `);

  // NULL means "shared across every tier" (or just a normal item on a
  // non-tiered quote - the existing, unchanged case). Set means "only
  // part of this one tier's package".
  await run(db, `
    ALTER TABLE quote_items ADD COLUMN tier_id TEXT
  `);

  // Which tier the customer actually picked when they accepted - only
  // meaningful once status = 'accepted' on a quote that has tiers.
  // NULL on a non-tiered quote forever, and NULL on a tiered quote right
  // up until it's accepted.
  await run(db, `
    ALTER TABLE quotes ADD COLUMN accepted_tier_id TEXT
  `);

};
