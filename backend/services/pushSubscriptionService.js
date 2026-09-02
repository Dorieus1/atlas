const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");


const runAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });
  });

};


const allAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

};


// Upsert by endpoint - a browser's push subscription endpoint already
// uniquely identifies "this device, this browser," so re-enabling
// notifications on a device that was already subscribed updates the
// existing row (in case its keys rotated) rather than creating a second
// row that would double-push the same device.
const saveSubscription = async (business_id, user_id, subscription) => {

  const { endpoint, keys } = subscription;

  const existing = await new Promise((resolve, reject) => {
    db.get(`SELECT id FROM push_subscriptions WHERE endpoint = ?`, [endpoint], (err, row) => (err ? reject(err) : resolve(row)));
  });

  if (existing) {

    await runAsync(

      `UPDATE push_subscriptions SET business_id = ?, user_id = ?, p256dh = ?, auth = ? WHERE endpoint = ?`,

      [business_id, user_id, keys.p256dh, keys.auth, endpoint]

    );

    return existing.id;

  }

  const id = uuidv4();

  await runAsync(

    `
    INSERT INTO push_subscriptions (id, business_id, user_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?, ?, ?)
    `,

    [id, business_id, user_id, endpoint, keys.p256dh, keys.auth]

  );

  return id;

};


// Scoped to business_id, not just endpoint, even though endpoint alone
// is already globally unique (migration 055's unique index) - endpoint
// is a value the CALLER supplies in the request body, not something
// looked up from an already-authenticated row first. Without this scope,
// any authenticated user from any business could delete another
// business's subscription just by sending that endpoint string, the
// same class of cross-tenant IDOR already fixed elsewhere in this
// codebase (see the quote-child delete fix from the 2026-08-27/28 audit).
const deleteSubscription = (endpoint, business_id) => {

  return runAsync(
    `DELETE FROM push_subscriptions WHERE endpoint = ? AND business_id = ?`,
    [endpoint, business_id]
  ).then((result) => result.changes > 0);

};


const getSubscriptionsForBusiness = (business_id) => {

  return allAsync(`SELECT * FROM push_subscriptions WHERE business_id = ?`, [business_id]);

};


module.exports = {

  saveSubscription,

  deleteSubscription,

  getSubscriptionsForBusiness

};
