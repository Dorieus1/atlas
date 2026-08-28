const { run } = require("./util");

module.exports = async (db) => {

  // A real bug review caught a genuine race: completing an appointment
  // auto-creates a draft invoice if none exists yet for it (see
  // appointmentController.js's updateAppointmentStatus), checked via a
  // plain "does a quote with this appointment_id already exist" read
  // with no transaction around it - a double-click or a client retry on
  // a slow request lets two concurrent completions both read "no
  // existing quote" and both create one, and since a service
  // agreement's completed visit now pre-fills that draft with the
  // plan's real price (not $0), the duplicate carries a real dollar
  // amount an owner could plausibly send to the customer. There was
  // nothing at the database layer to catch this - appointment_id had no
  // uniqueness constraint at all.
  //
  // Before adding the constraint: defensively unlink (never delete) any
  // pre-existing duplicates this exact race may have already produced,
  // keeping only the oldest quote linked to each appointment_id. This
  // never destroys a quote or its data - a newer duplicate just loses
  // its link back to the appointment it can no longer uniquely claim,
  // exactly as if it had been created as a standalone quote to begin
  // with.
  await run(db, `
    UPDATE quotes
    SET appointment_id = NULL
    WHERE id IN (
      SELECT q.id
      FROM quotes q
      WHERE q.appointment_id IS NOT NULL
      AND q.id != (
        SELECT q2.id
        FROM quotes q2
        WHERE q2.appointment_id = q.appointment_id
        ORDER BY q2.created_at ASC, q2.id ASC
        LIMIT 1
      )
    )
  `);

  await run(db, `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_appointment_id_unique
    ON quotes(appointment_id)
    WHERE appointment_id IS NOT NULL
  `);

};
