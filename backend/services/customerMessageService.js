const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");
const { sendEmail, escapeHtml } = require("./emailService");
const { getActiveCustomerById } = require("./customerService");
const { getBusinessById } = require("./businessService");


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


// The real "send this customer a message" feature the review flagged as
// missing - the only thing that looked like it before this (the in-CRM
// "Test Atlas" box) actually let an owner impersonate the CUSTOMER
// talking to the AI, not send the customer anything themselves. This
// sends a real email through the same Resend integration every other
// transactional email in the app already uses, and records it here so
// it shows up in the customer's own Activity Timeline - not a
// fire-and-forget action with no trace it ever happened.
const sendMessageToCustomer = async (customer_id, business_id, sent_by_user_id, subject, body) => {

  // getActiveCustomerById, not the unfiltered getCustomerById - a review
  // caught a real gap: trashing a customer never cascades to their open
  // leads, so a lead pointing at a since-trashed customer (spam, wrong
  // number, "please stop contacting me") is completely normal, and this
  // is reachable from LeadPipeline.jsx's own "Send Email" button, not
  // just the customer profile. getCustomerById is deliberately
  // unfiltered for the many staff-facing callers that need to still
  // reach a trashed customer's existing record (viewing their history,
  // say) - actually sending them a new, real email isn't one of those;
  // it belongs with the small set of callers customerService.js already
  // documents as needing a trashed customer treated as if they don't
  // exist.
  const customer = await getActiveCustomerById(customer_id, business_id);

  if (!customer) {
    return { error: "not_found" };
  }

  if (!customer.email) {
    return { error: "no_email" };
  }

  const business = await getBusinessById(business_id);

  // Plain text in, a simple paragraph-per-blank-line HTML email out -
  // this is a real message an owner is typing to a real person, not a
  // system template, so it shouldn't demand they know or use HTML.
  // escapeHtml first (the body is about to become another business's
  // customer's inbox content) then re-introduce just the line breaks the
  // owner actually typed.
  const html = `
    <div style="white-space: pre-wrap; font-family: sans-serif; font-size: 15px; line-height: 1.5;">${escapeHtml(body)}</div>
    <p style="margin-top: 24px; color: #666; font-size: 13px;">— ${escapeHtml(business?.name || "Your service provider")}</p>
  `;

  await sendEmail({
    to: customer.email,
    subject,
    html
  });

  const id = uuidv4();

  await runAsync(

    `
    INSERT INTO customer_messages (id, business_id, customer_id, sent_by_user_id, subject, body)
    VALUES (?, ?, ?, ?, ?, ?)
    `,

    [id, business_id, customer_id, sent_by_user_id, subject, body]

  );

  return { id, sentTo: customer.email };

};


const getMessagesByCustomer = (customer_id, business_id) => {

  return allAsync(

    `
    SELECT customer_messages.*, users.name AS sent_by_name
    FROM customer_messages
    LEFT JOIN users ON users.id = customer_messages.sent_by_user_id
    WHERE customer_messages.customer_id = ?
    AND customer_messages.business_id = ?
    ORDER BY customer_messages.created_at ASC
    `,

    [customer_id, business_id]

  );

};


module.exports = {
  sendMessageToCustomer,
  getMessagesByCustomer
};
