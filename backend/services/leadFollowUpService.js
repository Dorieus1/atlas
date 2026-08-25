const db = require("../../database/db");
const { generateFollowUp } = require("./followUpService");
const { createNotification } = require("./notificationService");


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


// Activates the `next_follow_up` column on leads, which until now was
// only ever written (by leadService.updateLead, when a lead is marked
// "contacted") and never read by anything. Deliberately not scoped to
// one business_id, same reasoning as invoiceReminderService.js and
// quoteReminderService.js - this is a background job covering every
// business, and each row's own business_id (via the lead record itself)
// is only ever used to address the right owner's notification.
//
// "Still needs following up" = status is not 'closed'. Leads only have
// four possible statuses (see VALID_LEAD_STATUSES in leadController.js):
// 'new', 'contacted', 'qualified', 'closed'. Of those, 'closed' is the
// only one the app itself already treats as a terminal, no-longer-active
// state - LeadPipeline.jsx's own isFollowUpOverdue() check excludes a
// lead from "overdue" for exactly this reason (`lead.status !== "closed"`).
// 'qualified' is a mid-pipeline stage, not a win/loss outcome, so a
// qualified lead can still have a legitimate reason to be followed up
// with later (e.g. it was marked qualified, a follow-up date was set by
// hand, and the deal is still open) - excluding it would silently break
// that case with no clear justification, so this matches the app's own
// existing definition of "active" rather than inventing a stricter one.
//
// No new migration: rather than adding a `last_auto_follow_up_at` column
// to dedupe same-day firing, this clears `next_follow_up` back to NULL
// once a draft has been created for it. That's simpler, needs no schema
// change, and is arguably more correct than a same-day check - it also
// naturally prevents firing twice for the same due date if this job runs
// again before a human has had a chance to review and re-schedule the
// next one. If the business wants another automated follow-up later, the
// normal flow (marking the lead "contacted" again, or a future manual
// "set next follow-up" feature) sets next_follow_up again.
//
// Human-in-the-loop by design: this drafts a message with the same
// AI-drafting logic the existing manual follow-up feature uses
// (followUpService.generateFollowUp, the function behind
// followUpController.js's POST /api/follow-up), but it does NOT email the
// lead directly. The manual flow itself is draft-only - it returns the
// drafted text to the business owner in the UI and stops there; nothing
// in that flow sends anything on its own. Elsewhere in this codebase,
// AI-generated content that reaches a customer directly (e.g. the
// knowledge-gap suggestions in knowledgeGapService.js) goes through an
// explicit owner-approval step before it's used, while only-internal AI
// output (e.g. the daily digest) is allowed to go out with no approval
// because nothing it says is ever seen by a customer. An automated,
// unreviewed email to a lead is customer-facing and carries real
// reputational risk (a wrong name, a hallucinated price, an oddly-timed
// message), so this follows the knowledge-gap precedent rather than the
// daily-digest one: draft the message, then create an owner notification
// ("Atlas drafted a follow-up for X, review and send") so a human decides
// whether it actually goes out.
const sendLeadFollowUps = async () => {

  const now = new Date().toISOString();

  const leads = await allAsync(

    `
    SELECT *
    FROM leads
    WHERE next_follow_up IS NOT NULL
    AND next_follow_up <= ?
    AND status != 'closed'
    `,

    [now]

  );

  let drafted = 0;

  for (const lead of leads) {

    // Best-effort, one lead at a time - matches invoiceReminderService.js
    // and quoteReminderService.js: a single AI-drafting failure or a bad
    // row should never stop the rest of the batch. Deliberately NOT
    // clearing next_follow_up when this fails - a lead that failed to get
    // a draft this run should still be picked up and retried next run,
    // rather than silently falling out of the queue.
    try {

      const summary =
        `Lead status: ${lead.status || "new"}. Interest: ${lead.interest || "General inquiry"}. This follow-up is overdue - the lead's next_follow_up date has passed with no update since.`;

      const message = await generateFollowUp(
        {
          id: lead.customer_id,
          name: lead.name,
          email: lead.email,
          phone: lead.phone
        },
        summary
      );

      await createNotification(

        lead.business_id,

        "lead_follow_up_draft",

        `📋 Follow-up drafted for ${lead.name || "a lead"}`,

        message,

        "/leads"

      );

      await runAsync(

        `
        UPDATE leads
        SET next_follow_up = NULL
        WHERE id = ?
        `,

        [lead.id]

      );

      drafted += 1;

    } catch (error) {

      console.error(`LEAD FOLLOW-UP DRAFT FAILED for lead ${lead.id}:`, error.message);

    }

  }

  return drafted;

};


module.exports = {
  sendLeadFollowUps
};
