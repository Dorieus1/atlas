const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3");

const {
  backupDatabase,
  pruneOldBackups,
  BACKUP_DIR,
  MAX_BACKUPS
} = require("../../database/backup");

describe("Database backups", () => {

  afterEach(() => {

    if (fs.existsSync(BACKUP_DIR)) {

      fs.rmSync(BACKUP_DIR, { recursive: true, force: true });

    }

  });

  test("creates a real, readable backup of the database", async () => {

    const backupPath = await backupDatabase();

    expect(fs.existsSync(backupPath)).toBe(true);

    const backupDb = new sqlite3.Database(backupPath);

    const tables = await new Promise((resolve, reject) => {

      backupDb.all(
        "SELECT name FROM sqlite_master WHERE type='table'",
        (err, rows) => err ? reject(err) : resolve(rows.map((r) => r.name))
      );

    });

    backupDb.close();

    expect(tables).toContain("businesses");
    expect(tables).toContain("customers");

  });

  test("only keeps the most recent backups, deleting older ones once past the limit", () => {

    if (!fs.existsSync(BACKUP_DIR)) {

      fs.mkdirSync(BACKUP_DIR, { recursive: true });

    }

    const totalToCreate = MAX_BACKUPS + 5;

    for (let i = 0; i < totalToCreate; i++) {

      const padded = String(i).padStart(3, "0");

      fs.writeFileSync(path.join(BACKUP_DIR, `atlas-${padded}.db`), "fake");

    }

    pruneOldBackups();

    const remaining = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("atlas-") && f.endsWith(".db"));

    expect(remaining).toHaveLength(MAX_BACKUPS);

    expect(remaining).not.toContain("atlas-000.db");
    expect(remaining).toContain(`atlas-${String(totalToCreate - 1).padStart(3, "0")}.db`);

  });

});
