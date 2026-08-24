const { run } = require("./util");

module.exports = async (db) => {

  await run(db, "ALTER TABLE leads ADD COLUMN last_contacted DATETIME");
  await run(db, "ALTER TABLE leads ADD COLUMN next_follow_up DATETIME");

};
