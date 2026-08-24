const fs = require("fs");
const path = require("path");

const TEST_DB_PATH =
  process.env.DB_PATH || path.join(__dirname, "..", "test.db");

const TEST_BACKUP_DIR =
  process.env.BACKUP_DIR || path.join(__dirname, "..", "test-backups");

module.exports = async () => {

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
