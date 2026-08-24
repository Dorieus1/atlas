const { run } = require("./util");

module.exports = async (db) => {

  await run(db, "ALTER TABLE users ADD COLUMN reset_token TEXT");
  await run(db, "ALTER TABLE users ADD COLUMN reset_token_expires DATETIME");

};
