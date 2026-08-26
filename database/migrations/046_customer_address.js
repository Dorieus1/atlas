const { run } = require("./util");

module.exports = async (db) => {

  // A general-purpose CRM still needs a property/service address on file
  // for most real jobs - "where is the work happening" is as basic a
  // fact as a phone number, and until now there was nowhere to put it.
  await run(db, "ALTER TABLE customers ADD COLUMN address TEXT");

};
