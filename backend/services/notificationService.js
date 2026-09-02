const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");
const { sendPushToBusiness } = require("./webPushService");



const createNotification = (business_id, type, title, body, link) => {

  return new Promise((resolve, reject) => {

    const id = uuidv4();

    db.run(

      `
      INSERT INTO notifications
      (id, business_id, type, title, body, link)
      VALUES (?, ?, ?, ?, ?, ?)
      `,

      [id, business_id, type, title, body || null, link || null],

      function (err) {

        if (err) {
          reject(err);
          return;
        }

        // Best-effort: every notification that already goes to the
        // in-app bell also fans out to any subscribed devices. Never
        // let a push failure affect whether creating the notification
        // itself succeeds.
        sendPushToBusiness(business_id, { title, body: body || "", link: link || "/" }).catch(() => {});

        resolve(id);

      }

    );

  });

};



const getNotifications = (business_id, limit = 50) => {

  return new Promise((resolve, reject) => {

    db.all(

      `
      SELECT *
      FROM notifications
      WHERE business_id = ?
      ORDER BY created_at DESC
      LIMIT ?
      `,

      [business_id, limit],

      (err, rows) => {

        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }

      }

    );

  });

};



const getUnreadCount = (business_id) => {

  return new Promise((resolve, reject) => {

    db.get(

      `
      SELECT COUNT(*) AS count
      FROM notifications
      WHERE business_id = ?
      AND read = 0
      `,

      [business_id],

      (err, row) => (err ? reject(err) : resolve(row.count))

    );

  });

};



const markAsRead = (id, business_id) => {

  return new Promise((resolve, reject) => {

    db.run(

      `
      UPDATE notifications
      SET read = 1
      WHERE id = ?
      AND business_id = ?
      `,

      [id, business_id],

      function (err) {

        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }

      }

    );

  });

};



const markAllAsRead = (business_id) => {

  return new Promise((resolve, reject) => {

    db.run(

      `
      UPDATE notifications
      SET read = 1
      WHERE business_id = ?
      AND read = 0
      `,

      [business_id],

      function (err) {

        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }

      }

    );

  });

};



module.exports = {

  createNotification,

  getNotifications,

  getUnreadCount,

  markAsRead,

  markAllAsRead

};
