const db = require("../../database/db");
const fs = require("fs");
const path = require("path");
const { UPLOAD_DIR } = require("./photoService");
const { withTransaction } = require("../../database/transactionQueue");


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


const allAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {

    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));

  });

};


// Deliberately not scoped to one business_id - this is a background job
// covering every business, not an API request, matching the same
// cross-tenant justification as reminderService.js and
// invoiceReminderService.js. Nothing here is ever returned via HTTP.
//
// 30 days is the advertised trash retention window (see the "Restore"
// UI copy on the frontend Trash view and CustomerProfile.jsx's delete
// confirmation). This runs every 6 hours - the same cadence as the
// database backup job in server.js - which is far more often than a
// 30-day window strictly needs, but cheap enough to run that often and
// means a customer is never left sitting in the trash noticeably past
// its 30 days just because of poll timing.
const RETENTION_DAYS = 30;


// Permanently removes one trashed customer and every row that hangs
// off it - the exact same cascade backend/services/customerService.js's
// deleteCustomer() used to perform immediately, before customers had a
// trash/restore window. Wrapped in withTransaction so this can never
// collide with a BEGIN/COMMIT block running concurrently elsewhere in
// the app (e.g. a quote being created at the same instant) - see
// database/transactionQueue.js.
const purgeCustomer = async (customer) => {

  const photos = await allAsync(
    `SELECT filename FROM photos WHERE customer_id = ? AND business_id = ?`,
    [customer.id, customer.business_id]
  );

  const result = await withTransaction(async () => {

    await runAsync("BEGIN TRANSACTION");

    try {

      await runAsync(`DELETE FROM notes WHERE customer_id = ?`, [customer.id]);

      await runAsync(`DELETE FROM conversations WHERE customer_id = ?`, [customer.id]);

      await runAsync(`DELETE FROM memories WHERE customer_id = ?`, [customer.id]);

      await runAsync(`DELETE FROM activities WHERE customer_id = ?`, [customer.id]);

      await runAsync(`DELETE FROM leads WHERE customer_id = ?`, [customer.id]);

      await runAsync(`DELETE FROM tasks WHERE customer_id = ?`, [customer.id]);

      await runAsync(`DELETE FROM appointments WHERE customer_id = ?`, [customer.id]);

      await runAsync(
        `DELETE FROM quote_items WHERE quote_id IN (SELECT id FROM quotes WHERE customer_id = ?)`,
        [customer.id]
      );

      await runAsync(
        `DELETE FROM quote_expenses WHERE quote_id IN (SELECT id FROM quotes WHERE customer_id = ?)`,
        [customer.id]
      );

      await runAsync(`DELETE FROM quotes WHERE customer_id = ?`, [customer.id]);

      await runAsync(`DELETE FROM photos WHERE customer_id = ?`, [customer.id]);

      await runAsync(`DELETE FROM review_requests WHERE customer_id = ?`, [customer.id]);

      await runAsync(`DELETE FROM portal_login_tokens WHERE customer_id = ?`, [customer.id]);

      await runAsync(`DELETE FROM customer_tags WHERE customer_id = ?`, [customer.id]);

      const deleted = await runAsync(

        `
        DELETE FROM customers
        WHERE id = ?
        AND business_id = ?
        AND deleted_at IS NOT NULL
        `,

        [customer.id, customer.business_id]

      );

      await runAsync("COMMIT");

      return deleted.changes > 0;

    } catch (err) {

      await runAsync("ROLLBACK").catch(() => {});

      throw err;

    }

  });

  photos.forEach((photo) => {

    fs.unlink(path.join(UPLOAD_DIR, photo.filename), (err) => {

      if (err && err.code !== "ENOENT") {
        console.error("Failed to remove photo file:", err.message);
      }

    });

  });

  return result;

};


// Finds every customer, across every business, that's been sitting in
// the trash for more than RETENTION_DAYS and permanently removes it and
// everything attached to it. Best-effort per customer - one business's
// bad data or a failed delete must never stop the rest of the batch
// from being purged.
const purgeOldTrashedCustomers = async () => {

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const customers = await allAsync(

    `
    SELECT id, business_id
    FROM customers
    WHERE deleted_at IS NOT NULL
    AND deleted_at <= ?
    `,

    [cutoff]

  );

  let purged = 0;

  for (const customer of customers) {

    try {

      const removed = await purgeCustomer(customer);

      if (removed) {
        purged += 1;
      }

    } catch (error) {

      console.error(`CUSTOMER PURGE FAILED for customer ${customer.id}:`, error.message);

    }

  }

  return purged;

};


module.exports = {
  purgeOldTrashedCustomers
};
