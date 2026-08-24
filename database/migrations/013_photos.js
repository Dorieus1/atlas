const { run } = require("./util");

module.exports = async (db) => {

  await run(db, `
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT,
      caption TEXT,
      mime_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

};
