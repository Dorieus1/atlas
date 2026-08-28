const { run } = require("./util");

module.exports = async (db) => {

  // Stored inline as a base64 PNG data URI rather than a file on disk
  // (the way photos are handled) - a drawn signature is small (typically
  // a few KB, capped well below that at the validation layer) and lives
  // in a strict one-to-one relationship with the quote it belongs to,
  // so a whole separate upload/file-serving path would be more
  // machinery than the data actually needs.
  await run(db, `ALTER TABLE quotes ADD COLUMN signature TEXT`);

  // "portal" (the customer signed remotely, on their own device, via
  // their portal login) or "in_person" (a staff member handed their own
  // device to the customer standing in front of them and they signed
  // directly in the business's own app). Distinct enough acceptance
  // circumstances that a business owner reviewing a signed quote later
  // should be able to tell them apart.
  await run(db, `ALTER TABLE quotes ADD COLUMN signature_method TEXT`);

};
