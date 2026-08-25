const { run } = require("./util");

module.exports = async (db) => {

  // Tracks the local-calendar-date (YYYY-MM-DD, in the business's own
  // timezone - see 026_business_timezone.js) the daily digest email was
  // last sent for this business. NULL means "never sent yet". This is
  // what guarantees dailyDigestService only ever emails a business once
  // per local day, no matter how often the underlying job polls.
  await run(db, `ALTER TABLE businesses ADD COLUMN last_digest_sent_date TEXT`);

};
