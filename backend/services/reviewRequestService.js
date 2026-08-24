const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");
const { sendEmail } = require("./emailService");


// Shared by the direct "Request Review" button and the auto-send-on-paid
// automation. Returns { sent: false, reason } for the two expected,
// non-error cases (no email on file, no review link configured yet) so
// callers can decide how loudly to report them - a direct API call turns
// that into a 400, but the automation just skips quietly. Only throws for
// a genuine failure (e.g. the email provider itself is down).
const sendReviewRequestForCustomer = async (business, customer) => {

  if (!customer.email) {
    return { sent: false, reason: "no_email" };
  }

  if (!business.review_link) {
    return { sent: false, reason: "no_review_link" };
  }

  await sendEmail({

    to: customer.email,

    subject: `How did we do, ${customer.name || "there"}?`,

    html: `
      <p>Hi ${customer.name || "there"},</p>
      <p>Thanks for choosing ${business.name}! If you have a minute, we'd really appreciate a quick review.</p>
      <p><a href="${business.review_link}">Leave us a review</a></p>
      <p>Thank you for your support!</p>
    `

  });

  await createReviewRequest(business.id, customer.id, customer.email);

  return { sent: true };

};



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

  sendReviewRequestForCustomer,

  createReviewRequest,

  getReviewRequestsByCustomer

};
