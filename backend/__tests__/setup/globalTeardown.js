const fs = require("fs");
const path = require("path");

module.exports = async () => {

  // globalSetup put every artifact for this run (database, backups,
  // uploads) under one per-run directory and recorded it here. Removing
  // that directory cleans all of them up at once.
  const runRoot = process.env.ATLAS_TEST_RUN_ROOT;

  if (runRoot) {

    fs.rmSync(runRoot, { recursive: true, force: true });

    // Drop the .runs parent too if this was the last run using it.
    const runsParent = path.dirname(runRoot);
    try {
      if (fs.readdirSync(runsParent).length === 0) {
        fs.rmdirSync(runsParent);
      }
    } catch {
      /* another run is still using it, or it's already gone */
    }

    return;

  }

  // Fallback for a run that somehow bypassed globalSetup: clean whatever
  // the configured paths point at.
  const TEST_DB_PATH =
    process.env.DB_PATH || path.join(__dirname, "..", "test.db");

  const TEST_BACKUP_DIR =
    process.env.BACKUP_DIR || path.join(__dirname, "..", "test-backups");

  for (const suffix of ["", "-journal", "-wal", "-shm"]) {

    const filePath = TEST_DB_PATH + suffix;

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

  }

  if (fs.existsSync(TEST_BACKUP_DIR)) {

    fs.rmSync(TEST_BACKUP_DIR, { recursive: true, force: true });

  }

};
