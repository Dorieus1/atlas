const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const TEST_DB_PATH =
  process.env.DB_PATH || path.join(__dirname, "..", "test.db");

module.exports = async () => {

  for (const suffix of ["", "-journal", "-wal", "-shm"]) {

    const filePath = TEST_DB_PATH + suffix;

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

  }

  const db = new sqlite3.Database(TEST_DB_PATH);

  await new Promise((resolve, reject) => {

    db.serialize(() => {

      db.run(`
        CREATE TABLE businesses (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          phone TEXT,
          email TEXT,
          address TEXT,
          industry TEXT,
          services TEXT
        )
      `);

      db.run(`
        CREATE TABLE customers (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL,
          name TEXT,
          email TEXT,
          phone TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE conversations (
          id TEXT PRIMARY KEY,
          customer_id TEXT NOT NULL,
          message TEXT NOT NULL,
          response TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE memories (
          id TEXT PRIMARY KEY,
          customer_id TEXT NOT NULL,
          memory TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE knowledge (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE leads (
          id TEXT PRIMARY KEY,
          customer_id TEXT NOT NULL,
          business_id TEXT NOT NULL,
          name TEXT,
          phone TEXT,
          email TEXT,
          interest TEXT,
          status TEXT DEFAULT 'new',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          priority TEXT DEFAULT 'warm',
          last_contacted DATETIME,
          next_follow_up DATETIME
        )
      `);

      db.run(`
        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          customer_id TEXT NOT NULL,
          note TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE activities (
          id TEXT PRIMARY KEY,
          customer_id TEXT NOT NULL,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE tasks (
          id TEXT PRIMARY KEY,
          customer_id TEXT NOT NULL,
          business_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT DEFAULT 'pending',
          due_date DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE appointments (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL,
          customer_id TEXT,
          title TEXT NOT NULL,
          notes TEXT,
          start_time DATETIME NOT NULL,
          end_time DATETIME,
          status TEXT DEFAULT 'scheduled',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL,
          name TEXT,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          reset_token TEXT,
          reset_token_expires DATETIME
        )
      `, (err) => {

        if (err) {
          reject(err);
        } else {
          resolve();
        }

      });

    });

  });

  await new Promise((resolve) => db.close(resolve));

};
