const { run } = require("./util");

module.exports = async (db) => {

  // A private, unguessable URL a business owner can paste into ANY
  // calendar app (Apple, Google, Outlook, anything that supports
  // "subscribe by URL") to see their Atlas schedule, without handing
  // over any account credentials the way the Google/Apple integrations
  // require. NULL until the owner first requests it - generated lazily
  // by calendarFeedService.getOrCreateFeedToken rather than at business
  // creation, so a business that never uses this feature never has one.
  await run(db, `ALTER TABLE businesses ADD COLUMN calendar_feed_token TEXT`);

};
