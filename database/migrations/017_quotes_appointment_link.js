const { run } = require("./util");

module.exports = async (db) => {

  await run(db, `ALTER TABLE quotes ADD COLUMN appointment_id TEXT`);

};
