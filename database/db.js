const sqlite3 = require("sqlite3").verbose();

const dbPath = process.env.DB_PATH || "./atlas.db";

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Database error:", err.message);
  } else {
    console.log("Atlas database connected");
  }
});

module.exports = db;