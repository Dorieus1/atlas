// Applies every schema change in database/migrations/ that hasn't run yet
// against this database, in filename order, and records each one in a
// `migrations` table so it's never re-applied. Safe to run any number of
// times, on an empty database file or an existing one.
//
// Run by hand:   npm run migrate
// Run automatically: backend/server.js calls runMigrations() on startup.
const fs = require("fs");
const path = require("path");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

const ensureMigrationsTable = (db) => {

  return new Promise((resolve, reject) => {

    db.run(
      `
      CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
      `,
      (err) => (err ? reject(err) : resolve())
    );

  });

};

const getAppliedIds = (db) => {

  return new Promise((resolve, reject) => {

    db.all("SELECT id FROM migrations", (err, rows) => {

      if (err) {
        reject(err);
      } else {
        resolve(new Set(rows.map((row) => row.id)));
      }

    });

  });

};

const recordApplied = (db, id) => {

  return new Promise((resolve, reject) => {

    db.run("INSERT INTO migrations (id) VALUES (?)", [id], (err) =>
      err ? reject(err) : resolve()
    );

  });

};

const runMigrations = async (db) => {

  await ensureMigrationsTable(db);

  const applied = await getAppliedIds(db);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".js") && file !== "util.js")
    .sort();

  for (const file of files) {

    const id = path.basename(file, ".js");

    if (applied.has(id)) {
      continue;
    }

    const migration = require(path.join(MIGRATIONS_DIR, file));

    console.log(`Applying migration ${id}...`);

    await migration(db);

    await recordApplied(db, id);

  }

  console.log("Database is up to date");

};

if (require.main === module) {

  const db = require("./db");

  runMigrations(db)
    .then(() => db.close())
    .catch((err) => {
      console.error("Migration failed:", err.message);
      db.close();
      process.exitCode = 1;
    });

}

module.exports = { runMigrations };
