const { run } = require("./util");

module.exports = async (db) => {

  await run(db, `ALTER TABLE businesses ADD COLUMN onboarding_dismissed INTEGER DEFAULT 0`);

};
