const db = require("../../database/db");
const { generateFollowUp } = require("./followUpService");
const { createNotification } = require("./notificationService");


const allAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {

    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));

  });

};


const getAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {

    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));

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


const DORMANT_DAYS = 90;

// Separate from DORMANT_DAYS on purpose, even though both are 90 today -
// one is "how old before we call this customer dormant", the other is
// "how long to wait before drafting another one for the same customer".
// Kept as two constants so either can change independently later without
// the other silently drifting along with it.
const COOLDOWN_DAYS = 90;


// A customer counts as a past-customer-worth-winning-back only if they
// have at least one appointment or quote ever - the INNER JOIN below
// naturally excludes anyone with neither, which is deliberate: a lead who
// chatted once but never got an appointment or a quote isn't "dormant",
// they're an unconverted lead, and leadFollowUpService.js already owns
// that case. This job is specifically for people who WERE serviced and
// have gone quiet since, which is a different (and differently-worded)
// outreach than "still deciding whether to hire you."
const findDormantCustomers = async () => {

  const cutoff = new Date(Date.now() - DORMANT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const cooldownCutoff = new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();

  return allAsync(

    `
    SELECT
      customers.*,
      MAX(activity.last_activity_at) AS last_activity_at
    FROM customers
    JOIN (
      SELECT customer_id, MAX(start_time) AS last_activity_at
      FROM appointments
      WHERE customer_id IS NOT NULL
      GROUP BY customer_id

      UNION ALL

      SELECT customer_id, MAX(created_at) AS last_activity_at
      FROM quotes
      GROUP BY customer_id
    ) activity ON activity.customer_id = customers.id
    WHERE customers.deleted_at IS NULL
    GROUP BY customers.id
    HAVING last_activity_at <= ?
    AND (customers.last_win_back_at IS NULL OR customers.last_win_back_at <= ?)
    `,

    [cutoff, cooldownCutoff]

  );

};


// Reports the TRUE current count of dormant customers for one business -
// deliberately does NOT apply the cooldown filter findDormantCustomers()
// uses. That filter answers "who still needs a win-back draft", which is
// the wrong question for anything just reporting a fact to the owner: a
// customer the job already drafted a message for stops being genuinely
// dormant the moment they come back, not the moment the cooldown expires,
// so counting them out for 90 days after a draft would make this number
// silently (and misleadingly) drop right after every job run even though
// nothing about their actual activity changed. Used by assistantService.js
// so "how many dormant customers do I have" answers the real question.
const countDormantCustomers = async (business_id) => {

  const cutoff = new Date(Date.now() - DORMANT_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const row = await getAsync(

    `
    SELECT COUNT(*) AS count
    FROM (
      SELECT customers.id
      FROM customers
      JOIN (
        SELECT customer_id, MAX(start_time) AS last_activity_at
        FROM appointments
        WHERE customer_id IS NOT NULL
        GROUP BY customer_id

        UNION ALL

        SELECT customer_id, MAX(created_at) AS last_activity_at
        FROM quotes
        GROUP BY customer_id
      ) activity ON activity.customer_id = customers.id
      WHERE customers.deleted_at IS NULL
      AND customers.business_id = ?
      GROUP BY customers.id
      HAVING MAX(activity.last_activity_at) <= ?
    )
    `,

    [business_id, cutoff]

  );

  return row.count;

};


// Human-in-the-loop by design, same reasoning as leadFollowUpService.js:
// this drafts a message with the same AI-drafting logic the manual
// follow-up feature already uses, but never emails the customer directly.
// It creates an owner notification linking to the customer's profile so a
// person decides whether to actually send it - an automated, unreviewed
// "come back!" email carries real reputational risk (wrong tone, a
// hallucinated reason, contacting someone who's since had a bad
// experience the AI has no way to know about).
const sendWinBackCampaign = async () => {

  const customers = await findDormantCustomers();

  let drafted = 0;

  for (const customer of customers) {

    // Best-effort, one customer at a time - matches every other
    // background outreach job in this codebase (invoiceReminderService,
    // quoteReminderService, leadFollowUpService): a single AI-drafting
    // failure should never stop the rest of the batch, and a customer
    // who fails this run is simply retried next run since last_win_back_at
    // is only updated on success.
    try {

      const daysSince = Math.floor(
        (Date.now() - new Date(customer.last_activity_at).getTime()) / (24 * 60 * 60 * 1000)
      );

      const summary =
        `This is a past customer who hasn't had an appointment or a quote in about ${daysSince} days. Draft a warm, no-pressure check-in inviting them back for a return visit or maintenance. Don't assume what kind of work they need beyond being a returning customer, and don't invent details about their prior job.`;

      const message = await generateFollowUp(
        {
          name: customer.name,
          email: customer.email,
          phone: customer.phone
        },
        summary
      );

      await createNotification(

        customer.business_id,

        "customer_win_back_draft",

        `${customer.name || "A customer"} hasn't been back in a while`,

        message,

        `/customers/${customer.id}`

      );

      await runAsync(

        `UPDATE customers SET last_win_back_at = ? WHERE id = ?`,

        [new Date().toISOString(), customer.id]

      );

      drafted += 1;

    } catch (error) {

      console.error(`WIN-BACK DRAFT FAILED for customer ${customer.id}:`, error.message);

    }

  }

  return drafted;

};


module.exports = {
  sendWinBackCampaign,
  findDormantCustomers,
  countDormantCustomers
};
