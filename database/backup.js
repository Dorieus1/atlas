const path = require("path");
const fs = require("fs");
const db = require("./db");

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

    db.run(

      "VACUUM INTO ?",

      [backupPath],

      (err) => {

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
