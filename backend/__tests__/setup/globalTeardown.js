const fs = require("fs");
const path = require("path");

const TEST_DB_PATH =
  process.env.DB_PATH || path.join(__dirname, "..", "test.db");

module.exports = async () => {

  for (const suffix of ["", "-journal", "-wal", "-shm"]) {

    const filePath = TEST_DB_PATH + suffix;

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

  }

};
