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
          services TEXT,
          review_link TEXT,
          slug TEXT,
          onboarding_dismissed INTEGER DEFAULT 0,
          stripe_account_id TEXT,
          stripe_onboarded INTEGER DEFAULT 0,
          business_hours TEXT,
          timezone TEXT,
          next_quote_number INTEGER NOT NULL DEFAULT 1001,
          last_digest_sent_date TEXT
        )
      `);

      db.run(`
        CREATE TABLE customers (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL,
          name TEXT,
          email TEXT,
          phone TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_by_user_id TEXT,
          created_by_name TEXT
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
        CREATE TABLE knowledge_gaps (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL,
          customer_id TEXT,
          question TEXT NOT NULL,
          suggested_title TEXT NOT NULL,
          suggested_content TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
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
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          reminder_sent_at DATETIME,
          recurrence_id TEXT,
          recurrence_rule TEXT,
          created_by_user_id TEXT,
          created_by_name TEXT
        )
      `);

      db.run(`
        CREATE TABLE quotes (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL,
          customer_id TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'quote',
          status TEXT NOT NULL DEFAULT 'draft',
          notes TEXT,
          appointment_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          stripe_checkout_session_id TEXT,
          paid_at DATETIME,
          sent_at DATETIME,
          last_reminder_sent_at DATETIME,
          reminder_count INTEGER NOT NULL DEFAULT 0,
          quote_number INTEGER,
          created_by_user_id TEXT,
          created_by_name TEXT,
          discount_type TEXT,
          discount_value REAL
        )
      `);

      db.run(`
        CREATE TABLE quote_items (
          id TEXT PRIMARY KEY,
          quote_id TEXT NOT NULL,
          description TEXT NOT NULL,
          quantity REAL NOT NULL DEFAULT 1,
          unit_price REAL NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE photos (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL,
          customer_id TEXT NOT NULL,
          filename TEXT NOT NULL,
          original_name TEXT,
          caption TEXT,
          mime_type TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE review_requests (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL,
          customer_id TEXT NOT NULL,
          sent_to TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE notifications (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT,
          link TEXT,
          read INTEGER NOT NULL DEFAULT 0,
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
          reset_token_expires DATETIME,
          role TEXT NOT NULL DEFAULT 'owner'
        )
      `);

      db.run(`
        CREATE TABLE saved_line_items (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL,
          description TEXT NOT NULL,
          unit_price REAL NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE tags (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE customer_tags (
          customer_id TEXT NOT NULL,
          tag_id TEXT NOT NULL,
          business_id TEXT NOT NULL,
          PRIMARY KEY (customer_id, tag_id)
        )
      `);

      // Kept as a separate CREATE TABLE from users, above, so this stays
      // the last statement with the resolve/reject callback attached.
      db.run(`
        CREATE TABLE portal_login_tokens (
          id TEXT PRIMARY KEY,
          customer_id TEXT NOT NULL,
          business_id TEXT NOT NULL,
          token TEXT NOT NULL UNIQUE,
          expires_at DATETIME NOT NULL,
          used INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
