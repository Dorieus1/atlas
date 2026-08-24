const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");



const createReviewRequest = (business_id, customer_id, sent_to) => {

  return new Promise((resolve, reject) => {

    const id = uuidv4();

    db.run(

      `
      INSERT INTO review_requests
      (id, business_id, customer_id, sent_to)
      VALUES (?, ?, ?, ?)
      `,

      [id, business_id, customer_id, sent_to],

      function (err) {

        if (err) {
          reject(err);
        } else {
          resolve(id);
        }

      }

    );

  });

};



const getReviewRequestsByCustomer = (customer_id, business_id) => {

  return new Promise((resolve, reject) => {

    db.all(

      `
      SELECT *
      FROM review_requests
      WHERE customer_id = ?
      AND business_id = ?
      ORDER BY created_at DESC
      `,

      [customer_id, business_id],

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



module.exports = {

  createReviewRequest,

  getReviewRequestsByCustomer

};
