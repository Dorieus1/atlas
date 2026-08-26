const { run } = require("./util");

module.exports = async (db) => {

  // Apple has no OAuth API for Calendar - the standard, Apple-sanctioned
  // way third-party apps sync with iCloud Calendar is CalDAV, authenticated
  // with an "app-specific password" the user generates at
  // appleid.apple.com specifically for this purpose (never their real
  // Apple ID password). Stored in plaintext here, matching how
  // google_refresh_token already is (see 036_google_calendar.js) - not a
  // new security posture, just the same one applied to a second provider.
  await run(db, `ALTER TABLE businesses ADD COLUMN apple_calendar_connected INTEGER NOT NULL DEFAULT 0`);
  await run(db, `ALTER TABLE businesses ADD COLUMN apple_calendar_email TEXT`);
  await run(db, `ALTER TABLE businesses ADD COLUMN apple_calendar_app_password TEXT`);

  // The full CalDAV URL of the specific calendar collection events get
  // written to, cached from the discovery PROPFIND walk at connect time
  // so every later sync skips straight to writing instead of
  // re-discovering the account's calendar layout on every appointment.
  await run(db, `ALTER TABLE businesses ADD COLUMN apple_calendar_url TEXT`);

};
