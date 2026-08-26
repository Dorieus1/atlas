const { run } = require("./util");

module.exports = async (db) => {

  // Lets a growing knowledge base be organized into groups (Pricing,
  // Hours & Location, Policies, etc.) instead of staying one long flat
  // list - a business with a few dozen entries has no way today to find
  // "all the pricing stuff" without reading every title.
  await run(db, "ALTER TABLE knowledge ADD COLUMN category TEXT");

};
