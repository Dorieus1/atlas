const { run } = require("./util");

module.exports = async (db) => {

  await run(db, `
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

};
