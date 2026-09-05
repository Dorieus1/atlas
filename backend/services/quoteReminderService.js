const db = require("../../database/db");
const { sendEmail, escapeHtml } = require("./emailService");
const { createLoginToken } = require("./portalAuthService");
const { applyDiscount, calculateDeposit } = require("./quoteService");


const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

function formatMoney(amount) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount || 0);
}

// Same reasoning as invoiceReminderService.js's matching constant - a
// week gives a customer real time to act before the link goes stale.
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


// Sibling to invoiceReminderService.js, deliberately kept as its own file
// rather than merged with it - quotes and invoices have different
// audiences (a prospect deciding whether to buy vs. a customer who
// already owes money) and, as this cadence shows, slightly different
// timing, matching the existing precedent of appointment reminders and
// invoice reminders already being two separate jobs rather than one
// merged one. Also deliberately not scoped to one business_id - see the
// matching comment in invoiceReminderService.js, same reasoning applies
// here unchanged.
//
// Cadence: first reminder 3 days after the quote was marked "sent" (same
// as invoices - that's how long is fair to wait before a first nudge
// either way), then every 4 days after that (one day tighter than the
// invoice job's 5-day cooldown) - an open estimate is more perishable
// than an unpaid invoice: the customer might book a competitor, the
// season might end, materials pricing might move, so it's worth nudging
// a little sooner. Still capped at 3 reminders total so a customer who
// isn't interested doesn't get chased forever. As with invoices,
// reminder_count and last_reminder_sent_at (not this function's polling
// interval) are what actually enforce the cadence and the cap.
//
// status = 'sent' alone is enough to exclude every other state a quote
// can be in - 'draft' (never sent), 'accepted', 'declined', and 'paid'
// are all distinct status values (see VALID_STATUSES in
// quoteController.js), so a quote that has moved on in any direction
// naturally drops out of this query without needing separate
// accepted_at/declined_at columns.
const sendQuoteReminders = async () => {

  const sentCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const reminderCutoff = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();

  const quotes = await allAsync(

    `
    SELECT
      quotes.id,
      quotes.customer_id,
      quotes.business_id,
      quotes.reminder_count,
      quotes.discount_type,
      quotes.discount_value,
      quotes.tax_rate,
      quotes.deposit_type,
      quotes.deposit_value,
      COALESCE(SUM(quote_items.quantity * quote_items.unit_price), 0) AS subtotal,
      customers.name AS customer_name,
      customers.email AS customer_email,
      businesses.name AS business_name,
      businesses.slug AS business_slug
    FROM quotes
    JOIN customers ON customers.id = quotes.customer_id
    JOIN businesses ON businesses.id = quotes.business_id
    LEFT JOIN quote_items ON quote_items.quote_id = quotes.id
    WHERE quotes.type = 'quote'
    AND quotes.status = 'sent'
    AND quotes.sent_at IS NOT NULL
    AND quotes.sent_at <= ?
    AND (quotes.last_reminder_sent_at IS NULL OR quotes.last_reminder_sent_at <= ?)
    AND quotes.reminder_count < 3
    AND customers.deleted_at IS NULL
    AND customers.email IS NOT NULL
    AND customers.email != ''
    GROUP BY quotes.id
    `,

    [sentCutoff, reminderCutoff]

  );

  let sent = 0;

  for (const quote of quotes) {

    // Best-effort, one quote at a time - matches invoiceReminderService.js:
    // a bad email address or a single failed send should never stop the
    // rest of the batch from going out.
    try {

      const { total } = applyDiscount(quote.subtotal, quote.discount_type, quote.discount_value, quote.tax_rate);
      const depositAmount = calculateDeposit(total, quote.deposit_type, quote.deposit_value);

      const token = await createLoginToken(quote.customer_id, quote.business_id, REMINDER_LINK_TTL_MINUTES);
      const portalUrl = `${FRONTEND_URL}/portal/${quote.business_slug}?token=${token}`;

      await sendEmail({

        to: quote.customer_email,

        subject: `Following up on your ${formatMoney(total)} estimate from ${quote.business_name}`,

        html: `
          <p>Hi ${escapeHtml(quote.customer_name) || "there"},</p>
          <p>Just checking in - you still have an open estimate from ${escapeHtml(quote.business_name)} for ${formatMoney(total)} that hasn't been accepted yet${quote.deposit_type ? ` (accepting it starts with a ${formatMoney(depositAmount)} deposit)` : ""}.</p>
          <p><a href="${portalUrl}">View and respond to it here</a></p>
          <p>If you've decided not to proceed, no action is needed. This link works for the next 7 days.</p>
        `

      });

      await runAsync(

        `
        UPDATE quotes
        SET last_reminder_sent_at = ?, reminder_count = reminder_count + 1
        WHERE id = ?
        `,

        [new Date().toISOString(), quote.id]

      );

      sent += 1;

    } catch (error) {

      console.error(`QUOTE REMINDER FAILED for quote ${quote.id}:`, error.message);

    }

  }

  return sent;

};


module.exports = {
  sendQuoteReminders
};
