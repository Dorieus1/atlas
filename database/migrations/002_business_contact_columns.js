const { run } = require("./util");

module.exports = async (db) => {

  await run(db, "ALTER TABLE businesses ADD COLUMN phone TEXT");
  await run(db, "ALTER TABLE businesses ADD COLUMN email TEXT");
  await run(db, "ALTER TABLE businesses ADD COLUMN address TEXT");
  await run(db, "ALTER TABLE businesses ADD COLUMN industry TEXT");
  await run(db, "ALTER TABLE businesses ADD COLUMN services TEXT");

};
