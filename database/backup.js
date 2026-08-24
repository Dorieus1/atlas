const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3");

const dbPath = process.env.DB_PATH || "./atlas.db";

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, "..", "backups");

const MAX_BACKUPS = 30;


const backupDatabase = () => {

  return new Promise((resolve, reject) => {

    if (!fs.existsSync(BACKUP_DIR)) {

      fs.mkdirSync(BACKUP_DIR, { recursive: true });

    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-");

    const backupPath = path.join(BACKUP_DIR, `atlas-${timestamp}.db`);

    // A dedicated connection, separate from the app's shared one, so a
    // VACUUM INTO never conflicts with whatever the app happens to be
    // doing on its own connection at the same moment.
    const backupConn = new sqlite3.Database(dbPath);

    backupConn.run(

      "VACUUM INTO ?",

      [backupPath],

      (err) => {

        backupConn.close();

        if (err) {

          console.error("Database backup failed:", err.message);

          reject(err);

          return;

        }

        console.log("Database backed up to", backupPath);

        pruneOldBackups();

        resolve(backupPath);

      }

    );

  });

};


const pruneOldBackups = () => {

  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("atlas-") && f.endsWith(".db"))
    .sort();

  while (files.length > MAX_BACKUPS) {

    const oldest = files.shift();

    fs.unlinkSync(path.join(BACKUP_DIR, oldest));

  }

};


module.exports = { backupDatabase, pruneOldBackups, BACKUP_DIR, MAX_BACKUPS };
