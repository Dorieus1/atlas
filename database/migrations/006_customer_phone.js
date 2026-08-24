const { run } = require("./util");

module.exports = async (db) => {

  await run(db, "ALTER TABLE customers ADD COLUMN phone TEXT");

};
