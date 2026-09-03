const { run } = require("./util");

module.exports = async (db) => {

  // A photo has always belonged to a customer (photos.customer_id, NOT
  // NULL since migration 013) but never to a specific JOB - a customer
  // with a dozen visits over a year had every photo dumped into one flat
  // gallery with no way to tell which visit each came from besides
  // whatever the caption happened to say. NULL means "not tied to a
  // particular job" (every existing photo, and any future customer-level
  // upload that isn't taken from a specific appointment's card).
  await run(db, `ALTER TABLE photos ADD COLUMN appointment_id TEXT`);

  // Free-text captions already let someone write "before" in the caption
  // box, but that's not something the UI can group or label by - this is
  // the actual before/after tag, validated at the controller layer (see
  // photoController's PHOTO_TYPES) rather than a SQL CHECK constraint,
  // matching how every other enum-shaped column in this app (quotes.type,
  // appointments.status, etc) is validated in application code. NULL
  // means "untagged" - today's behavior for every photo already taken.
  await run(db, `ALTER TABLE photos ADD COLUMN photo_type TEXT`);

  await run(db, `CREATE INDEX IF NOT EXISTS idx_photos_appointment_id ON photos(appointment_id)`);

};
