// The whole app shares a single sqlite3 connection (see database/db.js),
// and that connection is never opened in serialized mode. node-sqlite3
// does not queue db.run() calls issued by separate, concurrent async call
// stacks against each other - so two overlapping "BEGIN TRANSACTION ...
// COMMIT" blocks anywhere in the app (e.g. a quote being created at the
// same moment a customer is being deleted) can interleave and collide
// with "cannot start a transaction within a transaction", which would
// also leave the earlier transaction rolled back out from under it.
//
// This in-process promise-chain mutex serializes every multi-statement
// transaction in the whole app against every other one, so only one
// BEGIN...COMMIT block ever runs against the shared connection at a
// time, no matter which service/file it originates from. Every service
// that wraps more than one statement in BEGIN/COMMIT must route it
// through withTransaction() rather than calling BEGIN TRANSACTION
// directly - a transaction that bypasses this queue can still collide
// with one that doesn't.
let transactionQueue = Promise.resolve();

const withTransaction = (work) => {

  const result = transactionQueue.then(() => work());

  // Keep the queue moving even if this transaction fails, so a rejected
  // transaction doesn't wedge every transaction queued after it.
  transactionQueue = result.then(() => {}, () => {});

  return result;

};

module.exports = { withTransaction };
