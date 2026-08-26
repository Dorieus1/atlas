const db = require("../../database/db");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");


// ttlMinutes defaults to 15 - long enough for a customer to click a login
// link they just requested, but short-lived enough not to sit as a
// standing credential. A business owner emailing a customer about a new
// quote/invoice needs a longer window (the customer may not check email
// right away), so that flow passes a longer ttlMinutes explicitly.
const createLoginToken = (customer_id, business_id, ttlMinutes = 15) => {

  return new Promise((resolve, reject) => {

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

    db.run(

      `
      INSERT INTO portal_login_tokens
      (id, customer_id, business_id, token, expires_at)
      VALUES (?, ?, ?, ?, ?)
      `,

      [uuidv4(), customer_id, business_id, token, expiresAt],

      (err) => (err ? reject(err) : resolve(token))

    );

  });

};



// Single-use: the UPDATE's own WHERE clause (used = 0 AND expires_at > ?)
// is the thing that actually enforces single-use, not a SELECT beforehand -
// two requests racing the same token can both run that SELECT before
// either UPDATE commits, but only one UPDATE can ever match a still-
// unused row, since SQLite serializes writes. Whichever one flips
// used = 1 is the only one that gets `this.changes > 0` back.
const consumeLoginToken = (token, business_id) => {

  return new Promise((resolve, reject) => {

    db.run(

      `
      UPDATE portal_login_tokens
      SET used = 1
      WHERE token = ?
      AND business_id = ?
      AND used = 0
      AND expires_at > ?
      `,

      [token, business_id, new Date().toISOString()],

      function (updateErr) {

        if (updateErr) {
          return reject(updateErr);
        }

        if (this.changes === 0) {
          return resolve(null);
        }

        db.get(

          `SELECT * FROM portal_login_tokens WHERE token = ? AND business_id = ?`,

          [token, business_id],

          (err, row) => (err ? reject(err) : resolve(row))

        );

      }

    );

  });

};



// Deliberately shaped differently from a business user's token ({id,
// business_id}) - using customer_id + a "customer" type tag means a
// customer session can never be mistaken for (or accepted by) the
// business owner's authMiddleware, and vice versa.
const signCustomerToken = (customer_id, business_id) => {

  return jwt.sign(

    {
      customer_id,
      business_id,
      type: "customer"
    },

    process.env.JWT_SECRET,

    {
      expiresIn: "30d"
    }

  );

};



module.exports = {

  createLoginToken,

  consumeLoginToken,

  signCustomerToken

};
