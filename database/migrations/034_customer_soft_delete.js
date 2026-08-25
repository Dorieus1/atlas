const { run } = require("./util");

module.exports = async (db) => {

  // NULL means the customer is active/normal; a non-NULL timestamp means
  // they've been moved to the trash (see backend/services/customerService.js
  // deleteCustomer/restoreCustomer) and are awaiting permanent removal by
  // backend/services/customerPurgeService.js once 30 days have passed.
  await run(db, `ALTER TABLE customers ADD COLUMN deleted_at DATETIME`);

};
