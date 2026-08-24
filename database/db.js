const sqlite3 = require("sqlite3").verbose();

const dbPath = process.env.DB_PATH || "./atlas.db";

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Database error:", err.message);
  } else {
    console.log("Atlas database connected");

    db.run("PRAGMA journal_mode = WAL", (walErr) => {
      if (walErr) {
        console.error("Failed to enable WAL mode:", walErr.message);
      }
    });

    db.run("PRAGMA busy_timeout = 5000");
  }
});

module.exports = db;