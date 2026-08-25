const db = require("../../database/db");
const { sendEmail } = require("./emailService");


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
// Cadence: first reminder 3 days after the invoice was marked "sent",
// then every 5 days after that, capped at 3 reminders total so a
// non-paying customer doesn't get emailed forever. reminder_count and
// last_reminder_sent_at (not this function running on a timer) are what
// actually enforce the cadence and the cap, however often this runs.
const sendInvoiceReminders = async () => {

  const sentCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const reminderCutoff = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

  const invoices = await allAsync(

    `
    SELECT
      quotes.id,
      quotes.reminder_count,
      customers.name AS customer_name,
      customers.email AS customer_email,
      businesses.name AS business_name
    FROM quotes
    JOIN customers ON customers.id = quotes.customer_id
    JOIN businesses ON businesses.id = quotes.business_id
    WHERE quotes.type = 'invoice'
    AND quotes.status = 'sent'
    AND quotes.sent_at IS NOT NULL
    AND quotes.sent_at <= ?
    AND (quotes.last_reminder_sent_at IS NULL OR quotes.last_reminder_sent_at <= ?)
    AND quotes.reminder_count < 3
    AND customers.email IS NOT NULL
    AND customers.email != ''
    `,

    [sentCutoff, reminderCutoff]

  );

  let sent = 0;

  for (const invoice of invoices) {

    // Best-effort, one invoice at a time - a bad email address or a
    // single failed send should never stop the rest of the batch from
    // going out.
    try {

      await sendEmail({

        to: invoice.customer_email,

        subject: `Payment reminder: outstanding invoice from ${invoice.business_name}`,

        html: `
          <p>Hi ${invoice.customer_name || "there"},</p>
          <p>This is a friendly reminder that you have an outstanding invoice with ${invoice.business_name}.</p>
          <p>If you've already paid, please disregard this message. Otherwise, reply to this email or contact ${invoice.business_name} directly to take care of it.</p>
        `

      });

      await runAsync(

        `
        UPDATE quotes
        SET last_reminder_sent_at = ?, reminder_count = reminder_count + 1
        WHERE id = ?
        `,

        [new Date().toISOString(), invoice.id]

      );

      sent += 1;

    } catch (error) {

      console.error(`INVOICE REMINDER FAILED for invoice ${invoice.id}:`, error.message);

    }

  }

  return sent;

};


module.exports = {
  sendInvoiceReminders
};
