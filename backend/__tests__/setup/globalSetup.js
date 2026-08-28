const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

// Every `npm test` invocation gets its OWN database file (plus its own
// backup/upload dirs), rather than the single fixed
// backend/__tests__/test.db that every test process on the machine used
// to share. Two runs overlapping - a second `npm test` in another
// terminal, a sub-agent's run, a re-run started before the previous one
// had fully exited - would write their fixtures into the same SQLite
// file. Because globalSetup wipes and recreates the schema, the
// overlapping run then saw a half-populated `users` table and hit
// "UNIQUE constraint failed: users.email" deep inside
// createBusinessAndUser (helpers.js) - seemingly at random, in a
// different test file each time, and passing on an immediate solo
// re-run. A per-run directory makes concurrent runs fully independent.
const CONFIGURED_DB =
  process.env.DB_PATH || path.join(__dirname, "..", "test.db");

const RUNS_PARENT = path.join(path.dirname(CONFIGURED_DB), ".runs");

const RUN_ROOT = path.join(
  RUNS_PARENT,
  `run-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
);

const TEST_DB_PATH = path.join(RUN_ROOT, "test.db");

module.exports = async () => {

  // Sweep run dirs abandoned by earlier runs that were killed before
  // globalTeardown could clean up (older than 2h), so they don't pile
  // up forever.
  try {
    for (const entry of fs.readdirSync(RUNS_PARENT)) {
      const full = path.join(RUNS_PARENT, entry);
      try {
        if (Date.now() - fs.statSync(full).mtimeMs > 2 * 60 * 60 * 1000) {
          fs.rmSync(full, { recursive: true, force: true });
        }
      } catch {
        /* another run may be deleting the same stale dir - ignore */
      }
    }
  } catch {
    /* .runs doesn't exist yet - fine */
  }

  // Best-effort cleanup of the legacy shared db, in case an older run or
  // a bare `npx jest` left one behind at the configured path.
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const legacy = CONFIGURED_DB + suffix;
    try {
      if (fs.existsSync(legacy)) {
        fs.unlinkSync(legacy);
      }
    } catch {
      /* ignore */
    }
  }

  fs.mkdirSync(RUN_ROOT, { recursive: true });

  // Hand the per-run locations to the worker processes (which inherit
  // this env when Jest forks them) and to globalTeardown (same process).
  process.env.DB_PATH = TEST_DB_PATH;
  process.env.BACKUP_DIR = path.join(RUN_ROOT, "backups");
  process.env.UPLOAD_DIR = path.join(RUN_ROOT, "uploads");
  process.env.ATLAS_TEST_RUN_ROOT = RUN_ROOT;

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
          tour_completed INTEGER DEFAULT 0,
          stripe_account_id TEXT,
          stripe_onboarded INTEGER DEFAULT 0,
          business_hours TEXT,
          timezone TEXT,
          next_quote_number INTEGER NOT NULL DEFAULT 1001,
          last_digest_sent_date TEXT,
          google_calendar_connected INTEGER NOT NULL DEFAULT 0,
          google_refresh_token TEXT,
          google_calendar_email TEXT,
          apple_calendar_connected INTEGER NOT NULL DEFAULT 0,
          apple_calendar_email TEXT,
          apple_calendar_app_password TEXT,
          apple_calendar_url TEXT,
          calendar_feed_token TEXT,
          default_tax_rate REAL,
          default_hourly_labor_cost REAL
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
          created_by_name TEXT,
          deleted_at DATETIME,
          last_win_back_at DATETIME,
          address TEXT
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
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          category TEXT
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
          next_follow_up DATETIME,
          source TEXT
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
          created_by_name TEXT,
          google_event_id TEXT,
          assigned_user_id TEXT,
          clock_in_at DATETIME,
          clock_out_at DATETIME,
          service_agreement_id TEXT
        )
      `);

      db.run(`
        CREATE TABLE service_agreements (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL,
          customer_id TEXT NOT NULL,
          title TEXT NOT NULL,
          notes TEXT,
          price REAL,
          frequency TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          recurrence_id TEXT,
          start_date DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
          discount_value REAL,
          accepted_at DATETIME,
          accepted_by_name TEXT,
          declined_at DATETIME,
          deposit_type TEXT,
          deposit_value REAL,
          deposit_paid_at DATETIME,
          tax_rate REAL,
          signature TEXT,
          signature_method TEXT
        )
      `);

      // Mirrors migration 052 - guards against two concurrent "mark
      // appointment completed" requests both creating a draft invoice
      // for the same appointment. Without this in the hand-maintained
      // test schema, a test exercising that race would pass for the
      // wrong reason (no constraint to catch it) rather than actually
      // proving the fix works.
      db.run(`
        CREATE UNIQUE INDEX idx_quotes_appointment_id_unique
        ON quotes(appointment_id)
        WHERE appointment_id IS NOT NULL
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
        CREATE TABLE quote_expenses (
          id TEXT PRIMARY KEY,
          quote_id TEXT NOT NULL,
          description TEXT NOT NULL,
          amount REAL NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE quote_payments (
          id TEXT PRIMARY KEY,
          quote_id TEXT NOT NULL,
          amount REAL NOT NULL,
          method TEXT NOT NULL DEFAULT 'other',
          note TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_by_user_id TEXT,
          created_by_name TEXT
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
          role TEXT NOT NULL DEFAULT 'owner',
          password_changed_at DATETIME
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

  // A freshly created per-run database must be empty. If it already has
  // users, some other process is writing to this same path - fail here
  // with a clear message instead of letting it surface as a baffling
  // "UNIQUE constraint failed: users.email" in a random test later.
  await new Promise((resolve, reject) => {
    db.get("SELECT COUNT(*) AS n FROM users", (err, row) => {
      if (err) {
        reject(err);
      } else if (row.n !== 0) {
        reject(new Error(
          `Test database ${TEST_DB_PATH} already contains ${row.n} user(s) ` +
          `immediately after schema creation. Another test process is ` +
          `sharing this database path. Each 'npm test' run must use its ` +
          `own database - see backend/__tests__/setup/globalSetup.js.`
        ));
      } else {
        resolve();
      }
    });
  });

  await new Promise((resolve) => db.close(resolve));

};
