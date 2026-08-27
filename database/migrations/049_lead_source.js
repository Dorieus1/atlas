const { run } = require("./util");

module.exports = async (db) => {

  await run(db, `ALTER TABLE leads ADD COLUMN source TEXT`);

};
