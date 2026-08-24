const { run } = require("./util");

module.exports = async (db) => {

  await run(db, `ALTER TABLE appointments ADD COLUMN reminder_sent_at DATETIME`);

};
