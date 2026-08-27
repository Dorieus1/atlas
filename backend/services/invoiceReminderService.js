const db = require("../../database/db");
const { sendEmail, escapeHtml } = require("./emailService");
const { createLoginToken } = require("./portalAuthService");
const { applyDiscount, calculateDeposit, formatQuoteNumber } = require("./quoteService");
const { createNotification } = require("./notificationService");


const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

function formatMoney(amount) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount || 0);
}

// A week gives a customer real time to notice and act on a reminder
// email before the link goes stale, matching the TTL used when an
// owner manually sends a quote/invoice (quoteController.js's
// QUOTE_EMAIL_LINK_TTL_MINUTES) - same reasoning, this isn't a
// customer-initiated "log me in right now" click.
const REMINDER_LINK_TTL_MINUTES = 7 * 24 * 60;


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
      quotes.type,
      quotes.quote_number,
      quotes.customer_id,
      quotes.business_id,
      quotes.reminder_count,
      quotes.discount_type,
      quotes.discount_value,
      quotes.tax_rate,
      quotes.deposit_type,
      quotes.deposit_value,
      quotes.deposit_paid_at,
      COALESCE(SUM(quote_items.quantity * quote_items.unit_price), 0) AS subtotal,
      customers.name AS customer_name,
      customers.email AS customer_email,
      businesses.name AS business_name,
      businesses.slug AS business_slug
    FROM quotes
    JOIN customers ON customers.id = quotes.customer_id
    JOIN businesses ON businesses.id = quotes.business_id
    LEFT JOIN quote_items ON quote_items.quote_id = quotes.id
    WHERE quotes.type = 'invoice'
    AND quotes.status = 'sent'
    AND quotes.sent_at IS NOT NULL
    AND quotes.sent_at <= ?
    AND (quotes.last_reminder_sent_at IS NULL OR quotes.last_reminder_sent_at <= ?)
    AND quotes.reminder_count < 3
    AND customers.email IS NOT NULL
    AND customers.email != ''
    GROUP BY quotes.id
    `,

    [sentCutoff, reminderCutoff]

  );

  let sent = 0;

  for (const invoice of invoices) {

    // Best-effort, one invoice at a time - a bad email address or a
    // single failed send should never stop the rest of the batch from
    // going out.
    try {

      const { total } = applyDiscount(invoice.subtotal, invoice.discount_type, invoice.discount_value, invoice.tax_rate);
      const depositAmount = calculateDeposit(total, invoice.deposit_type, invoice.deposit_value);
      const depositOwed = invoice.deposit_type && !invoice.deposit_paid_at;

      const token = await createLoginToken(invoice.customer_id, invoice.business_id, REMINDER_LINK_TTL_MINUTES);
      const portalUrl = `${FRONTEND_URL}/portal/${invoice.business_slug}?token=${token}`;

      await sendEmail({

        to: invoice.customer_email,

        subject: `Payment reminder: ${formatMoney(total)} outstanding with ${invoice.business_name}`,

        html: `
          <p>Hi ${escapeHtml(invoice.customer_name) || "there"},</p>
          <p>This is a friendly reminder that you have an outstanding invoice with ${escapeHtml(invoice.business_name)} for ${formatMoney(total)}${depositOwed ? `, including a ${formatMoney(depositAmount)} deposit to get started` : ""}.</p>
          <p><a href="${portalUrl}">View and pay it here</a></p>
          <p>If you've already paid, please disregard this message. This link works for the next 7 days.</p>
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

      // Only on the invoice's first reminder - this is the moment it
      // actually *becomes* overdue from the owner's perspective, not
      // something to re-notify about on every 5-day follow-up. Best-effort,
      // same reasoning as every other notification in this codebase: a
      // notification failure must never count as the reminder itself
      // having failed.
      if (invoice.reminder_count === 0) {

        try {

          const numberPart = invoice.quote_number ? formatQuoteNumber(invoice.type, invoice.quote_number) : null;

          await createNotification(

            invoice.business_id,

            "invoice_overdue",

            `⏰ ${invoice.customer_name || "A customer"}'s invoice is overdue`,

            numberPart,

            "/quotes"

          );

        } catch (notificationError) {

          console.error(`OVERDUE INVOICE NOTIFICATION FAILED for invoice ${invoice.id}:`, notificationError);

        }

      }

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
