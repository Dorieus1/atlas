const { v4: uuidv4 } = require("uuid");
const { run } = require("./util");

module.exports = async (db) => {

  // Real per-technician time tracking: appointments.clock_in_at/
  // clock_out_at (migration from the earlier time-tracking feature) only
  // ever supported ONE clock session per job, no matter how many people
  // actually worked it - a real gap flagged in review. This table
  // supports many independent sessions per appointment, one per person,
  // each clocking themselves in and out. appointments.clock_in_at/
  // clock_out_at are left in place (not dropped) rather than risk data
  // loss on a column removal, but nothing new reads or writes them after
  // this migration - see the one-time backfill below and
  // timeEntryService.js for the real, current source of truth going
  // forward.
  await run(db, `
    CREATE TABLE time_entries (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      appointment_id TEXT NOT NULL,
      user_id TEXT,
      clock_in_at DATETIME NOT NULL,
      clock_out_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // user_id is nullable: a business could plausibly clear a teammate
  // account later (nothing in this app currently deletes a user, but
  // there's no reason this table's own integrity should depend on that
  // staying true forever) - an orphaned time entry still counts toward
  // real labor cost even once nobody can be named for it.
  await run(db, `
    CREATE INDEX idx_time_entries_appointment_id
    ON time_entries(appointment_id)
  `);

  await run(db, `
    CREATE INDEX idx_time_entries_business_id
    ON time_entries(business_id)
  `);

  // One-time backfill: every appointment that already has real clock
  // data becomes exactly one time_entries row, attributed to whoever
  // the appointment was assigned to at the time (NULL/unattributed if
  // it was never assigned to anyone) - preserves every business's real
  // historical labor-cost numbers (Analytics' Profit Margin) instead of
  // silently zeroing them out the moment this table becomes the only
  // thing analyticsService.js reads from.
  const rowsToBackfill = await new Promise((resolve, reject) => {

    db.all(

      `
      SELECT id, business_id, assigned_user_id, clock_in_at, clock_out_at
      FROM appointments
      WHERE clock_in_at IS NOT NULL
      `,

      (err, rows) => (err ? reject(err) : resolve(rows))

    );

  });

  for (const row of rowsToBackfill) {

    await run(db, `
      INSERT INTO time_entries (id, business_id, appointment_id, user_id, clock_in_at, clock_out_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [uuidv4(), row.business_id, row.id, row.assigned_user_id, row.clock_in_at, row.clock_out_at]);

  }

};
