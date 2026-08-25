const { run } = require("./util");

module.exports = async (db) => {

  await run(db, `ALTER TABLE quotes ADD COLUMN sent_at DATETIME`);
  await run(db, `ALTER TABLE quotes ADD COLUMN last_reminder_sent_at DATETIME`);
  await run(db, `ALTER TABLE quotes ADD COLUMN reminder_count INTEGER NOT NULL DEFAULT 0`);

};
