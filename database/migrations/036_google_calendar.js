const { run } = require("./util");

module.exports = async (db) => {

  // Mirrors how Stripe's account id is stored on businesses (see
  // 0xx stripe migrations / businessService.setStripeAccountId) - plaintext
  // in the businesses row, not a new security posture. Google's OAuth2
  // refresh tokens don't expire under normal use, so storing this is what
  // lets Atlas create calendar events on the business's behalf indefinitely
  // without them re-authorizing every time.
  await run(db, `ALTER TABLE businesses ADD COLUMN google_calendar_connected INTEGER NOT NULL DEFAULT 0`);
  await run(db, `ALTER TABLE businesses ADD COLUMN google_refresh_token TEXT`);

  // The connected Google account's email - shown in Settings so the
  // business can confirm which account is connected.
  await run(db, `ALTER TABLE businesses ADD COLUMN google_calendar_email TEXT`);

  // The Google Calendar event id for a synced appointment, so a later
  // status change or delete can update/remove the right event.
  await run(db, `ALTER TABLE appointments ADD COLUMN google_event_id TEXT`);

};
