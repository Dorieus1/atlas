const { run } = require("./util");

module.exports = async (db) => {

  // Structured weekly hours, stored as a JSON string keyed by day
  // abbreviation (mon..sun), e.g. {"mon":{"open":"09:00","close":"17:00"},
  // "sat":null,...}. NULL means "no hours configured yet" - the portal
  // appointment-request flow must treat that as "don't enforce anything",
  // never as "closed every day".
  await run(db, `ALTER TABLE businesses ADD COLUMN business_hours TEXT`);

};
