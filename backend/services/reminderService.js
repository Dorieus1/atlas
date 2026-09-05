const db = require("../../database/db");
const { sendEmail, escapeHtml } = require("./emailService");


const allAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {

    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));

  });

};


const runAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {

    db.run(sql, params, function (err) {

      if (err) {
        reject(err);
      } else {
        resolve(this);
      }

    });

  });

};


// Deliberately not scoped to one business_id - this is a background job
// covering every business, not an API request. Nothing here is ever
// returned to an HTTP response; each row's own business_id (via the
// join) is only ever used to address the right customer's email, so
// there's no cross-tenant exposure.
//
// The 23-25 hour window is centered on "24 hours from now" - wide
// enough that a reminder never falls through the gap between poll
// intervals, but reminder_sent_at (not the window) is what actually
// guarantees each appointment only ever gets one reminder, however many
// times this runs while the appointment sits inside that window.
//
// customers.deleted_at IS NULL matters here even though the appointment
// itself is untouched by trashing a customer (see deleteCustomer's own
// comment in customerService.js) - a business that trashed a customer
// has no reason to expect Atlas to keep emailing that person on its own.
const sendAppointmentReminders = async () => {

  const windowStart = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();

  const appointments = await allAsync(

    `
    SELECT
      appointments.id,
      appointments.title,
      appointments.start_time,
      customers.name AS customer_name,
      customers.email AS customer_email,
      businesses.name AS business_name
    FROM appointments
    JOIN customers ON customers.id = appointments.customer_id
    JOIN businesses ON businesses.id = appointments.business_id
    WHERE appointments.status = 'scheduled'
    AND appointments.reminder_sent_at IS NULL
    AND appointments.start_time BETWEEN ? AND ?
    AND customers.deleted_at IS NULL
    AND customers.email IS NOT NULL
    AND customers.email != ''
    `,

    [windowStart, windowEnd]

  );

  let sent = 0;

  for (const appt of appointments) {

    // Best-effort, one appointment at a time - a bad email address or a
    // single failed send should never stop the rest of the batch from
    // going out.
    try {

      const when = new Date(appt.start_time).toLocaleString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });

      await sendEmail({

        to: appt.customer_email,

        subject: `Reminder: your appointment with ${appt.business_name}`,

        html: `
          <p>Hi ${escapeHtml(appt.customer_name) || "there"},</p>
          <p>This is a friendly reminder about your upcoming appointment with ${escapeHtml(appt.business_name)}:</p>
          <p><strong>${escapeHtml(appt.title)}</strong><br>${when}</p>
          <p>If you need to reschedule, just reply to this email or give us a call.</p>
        `

      });

      await runAsync(

        `UPDATE appointments SET reminder_sent_at = ? WHERE id = ?`,

        [new Date().toISOString(), appt.id]

      );

      sent += 1;

    } catch (error) {

      console.error(`APPOINTMENT REMINDER FAILED for appointment ${appt.id}:`, error.message);

    }

  }

  return sent;

};


module.exports = {
  sendAppointmentReminders
};
