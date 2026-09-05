const db = require("../../database/db");
const { sendEmail, escapeHtml, renderEmailLayout } = require("./emailService");
const { getUsersByBusiness } = require("./authService");
const { getAppointments } = require("./appointmentService");


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


// 8am local is the target send time: late enough that an owner opening
// their inbox at the start of the business day sees it, early enough
// that it reads as "here's what's waiting for you today" rather than
// news from yesterday. This job runs on the same 30-minute cadence as
// the other two scheduled jobs in this file's family (see reminderService
// and invoiceReminderService) - it does NOT try to fire at exactly 8:00,
// it just checks "is it hour 8 right now, in this business's own
// timezone, and have we not already sent today" on every poll. Hitting
// this window sometime between 8:00 and 8:59 local is the actual goal.
const TARGET_LOCAL_HOUR = 8;

const NEW_LEAD_WINDOW_MS = 24 * 60 * 60 * 1000;


// Converts a UTC instant into the given IANA timezone's local calendar
// date (YYYY-MM-DD) and hour (0-23). Falls back to UTC when timezone is
// null/undefined, matching the same default used throughout
// businessHoursService for businesses that haven't set one yet. Reuses
// the exact Intl.DateTimeFormat + formatToParts technique
// getLocalDayAndTime uses, just returning a calendar date instead of a
// day-of-week key since a digest needs to compare against a stored
// "have we sent today" date, not a weekly hours table.
function getLocalDateAndHour(date, timezone) {

  const zone = timezone || "UTC";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false
  }).formatToParts(date);

  const lookup = {};

  for (const part of parts) {
    lookup[part.type] = part.value;
  }

  // Some ICU builds format local midnight as hour "24" instead of "00"
  // when hour12 is false - normalize the same way getLocalDayAndTime
  // does, so a business at exactly local midnight is treated as hour 0
  // rather than an out-of-range 24.
  const hour = lookup.hour === "24" ? 0 : parseInt(lookup.hour, 10);

  return {
    dateKey: `${lookup.year}-${lookup.month}-${lookup.day}`,
    hour
  };

}


// Gathers everything the digest needs for one business. Reuses
// getAppointments (appointmentService) rather than re-deriving conflict
// logic; leads and invoices are simple enough to query directly here,
// matching how reminderService/invoiceReminderService query straight
// from db rather than going through a service layer for their one-off
// background-job queries.
async function gatherDigestData(business, now, todayKey) {

  const windowStart = new Date(now.getTime() - NEW_LEAD_WINDOW_MS).toISOString();

  const newLeads = await allAsync(

    `
    SELECT id, name, email, phone, priority, created_at
    FROM leads
    WHERE business_id = ?
    AND created_at >= ?
    ORDER BY created_at DESC
    `,

    [business.id, windowStart]

  );

  // "Needing follow-up": still hot, and not already moved past active
  // work on it. Not scoped to the 24h window on purpose - a hot lead
  // from three days ago that's still sitting in "new"/"contacted" is
  // exactly the kind of thing this digest exists to surface.
  const hotLeads = await allAsync(

    `
    SELECT id, name, email, phone, status, created_at
    FROM leads
    WHERE business_id = ?
    AND priority = 'hot'
    AND status != 'closed'
    ORDER BY created_at DESC
    `,

    [business.id]

  );

  const allAppointments = await getAppointments(business.id);

  const todaysAppointments = allAppointments
    .filter((appt) => appt.status === "scheduled")
    .filter((appt) => getLocalDateAndHour(new Date(appt.start_time), business.timezone).dateKey === todayKey)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  // Same shape as invoiceReminderService's query (type='invoice',
  // status='sent'), minus the age/cooldown filters that job needs for
  // its own cadence - this is just a headline count for the digest.
  const overdueInvoices = await allAsync(

    `
    SELECT quotes.id
    FROM quotes
    WHERE quotes.business_id = ?
    AND quotes.type = 'invoice'
    AND quotes.status = 'sent'
    `,

    [business.id]

  );

  return {
    newLeads,
    hotLeads,
    todaysAppointments,
    overdueInvoicesCount: overdueInvoices.length
  };

}


function formatAppointmentTime(startTime, timezone) {

  return new Date(startTime).toLocaleString("en-US", {
    timeZone: timezone || "UTC",
    hour: "numeric",
    minute: "2-digit"
  });

}


// Builds the subject/html for one business's digest. Kept short and
// skimmable - a stat line up top (same "numbers first" shape as the
// dashboard's Daily Briefing panel: total/hot leads, tasks/appointments
// at a glance) followed by short lists, not a data dump.
function buildDigestEmail(business, data) {

  const { newLeads, hotLeads, todaysAppointments, overdueInvoicesCount } = data;

  const topLeadNames = newLeads
    .slice(0, 2)
    .map((lead) => escapeHtml(lead.name || lead.email || lead.phone || "a new lead"));

  const subject = `Your daily update from ${business.name}`;

  const sections = [];

  sections.push(`
    <p>
      <strong>${newLeads.length}</strong> new lead${newLeads.length === 1 ? "" : "s"} in the last 24 hours
      ${topLeadNames.length > 0 ? `(including ${topLeadNames.join(" and ")})` : ""}.
    </p>
  `);

  if (hotLeads.length > 0) {

    sections.push(`
      <p><strong>${hotLeads.length}</strong> hot lead${hotLeads.length === 1 ? "" : "s"} still need${hotLeads.length === 1 ? "s" : ""} follow-up:</p>
      <ul>
        ${hotLeads.slice(0, 5).map((lead) => `<li>${escapeHtml(lead.name || lead.email || lead.phone || "Unnamed lead")}</li>`).join("")}
      </ul>
    `);

  }

  if (todaysAppointments.length > 0) {

    sections.push(`
      <p><strong>${todaysAppointments.length}</strong> appointment${todaysAppointments.length === 1 ? "" : "s"} today:</p>
      <ul>
        ${todaysAppointments.map((appt) => `<li>${formatAppointmentTime(appt.start_time, business.timezone)} - ${escapeHtml(appt.title)}${appt.customer_name ? ` (${escapeHtml(appt.customer_name)})` : ""}</li>`).join("")}
      </ul>
    `);

  } else {

    sections.push(`<p>No appointments scheduled today.</p>`);

  }

  if (overdueInvoicesCount > 0) {

    sections.push(`
      <p><strong>${overdueInvoicesCount}</strong> unpaid invoice${overdueInvoicesCount === 1 ? "" : "s"} still outstanding.</p>
    `);

  }

  const html = renderEmailLayout({
    heading: escapeHtml(business.name),
    accentColor: business.accent_color,
    bodyHtml: `
      <p>Good morning,</p>
      <p>Here's what's happening at ${escapeHtml(business.name)} today:</p>
      ${sections.join("")}
      <p>Log in to Atlas for the full picture.</p>
    `
  });

  return { subject, html };

}


// Deliberately not scoped to one business_id - this is a background job
// covering every business, not an API request. Nothing here is ever
// returned via HTTP; each business's own owners (via getUsersByBusiness)
// are only ever used to address the right business's email, so there's
// no cross-tenant exposure.
//
// last_digest_sent_date (a local-calendar-date string, not a timestamp)
// is what actually guarantees a business is never emailed twice in the
// same local day, however often this job runs. The hour check just gates
// *when* within a day a business becomes eligible.
const sendDailyDigests = async () => {

  const now = new Date();

  const businesses = await allAsync(
    `SELECT id, name, timezone, last_digest_sent_date, accent_color FROM businesses`
  );

  let sent = 0;

  for (const business of businesses) {

    // Best-effort, one business at a time - a bad timezone value, a
    // malformed row, or a failed query for one business must never stop
    // the rest of the batch from being evaluated.
    try {

      const { dateKey, hour } = getLocalDateAndHour(now, business.timezone);

      if (hour !== TARGET_LOCAL_HOUR) {
        continue;
      }

      if (business.last_digest_sent_date === dateKey) {
        continue;
      }

      const data = await gatherDigestData(business, now, dateKey);

      const hasContent =
        data.newLeads.length > 0 ||
        data.hotLeads.length > 0 ||
        data.todaysAppointments.length > 0 ||
        data.overdueInvoicesCount > 0;

      // Decision: skip sending when a business has genuinely nothing to
      // report (zero new leads, zero hot leads outstanding, zero
      // appointments today, zero unpaid invoices). A "nothing happened"
      // email every single business day is more likely to train an
      // owner to ignore/mute this digest than to reassure them -
      // whereas skipping quiet days keeps the emails that DO arrive
      // meaningful. (Documented per the task's "pick one and justify
      // it" - a per-business opt-out toggle is a reasonable v2, not
      // built here.)
      let anySent = false;
      let attemptedAnySend = false;

      if (hasContent) {

        const owners = (await getUsersByBusiness(business.id))
          .filter((user) => user.role === "owner" && user.email);

        const { subject, html } = buildDigestEmail(business, data);

        for (const owner of owners) {

          attemptedAnySend = true;

          try {

            await sendEmail({ to: owner.email, subject, html });

            sent += 1;
            anySent = true;

          } catch (emailError) {

            console.error(`DAILY DIGEST EMAIL FAILED for business ${business.id}, owner ${owner.id}:`, emailError.message);

          }

        }

      }

      // Mark the day as handled unless we actually tried to send and
      // every single send failed - in that case leave
      // last_digest_sent_date alone so the next poll (still within
      // today's local hour-8 window) gets another shot, the same
      // "retry until it actually goes out" behavior the appointment and
      // invoice reminder jobs get for free from their per-row sent
      // timestamps.
      const shouldMarkDone = !attemptedAnySend || anySent;

      if (shouldMarkDone) {

        await runAsync(
          `UPDATE businesses SET last_digest_sent_date = ? WHERE id = ?`,
          [dateKey, business.id]
        );

      }

    } catch (error) {

      console.error(`DAILY DIGEST FAILED for business ${business.id}:`, error.message);

    }

  }

  return sent;

};


module.exports = {
  sendDailyDigests,
  getLocalDateAndHour,
  TARGET_LOCAL_HOUR
};
