const db = require("../../database/db");


const getBusinessById = (id) => {

  return new Promise((resolve, reject) => {

    db.get(

      `SELECT * FROM businesses WHERE id = ?`,

      [id],

      (err, row) => (err ? reject(err) : resolve(row))

    );

  });

};



const getBusinessBySlug = (slug) => {

  return new Promise((resolve, reject) => {

    db.get(

      `SELECT * FROM businesses WHERE slug = ?`,

      [slug],

      (err, row) => (err ? reject(err) : resolve(row))

    );

  });

};



const setStripeAccountId = (business_id, stripeAccountId) => {

  return new Promise((resolve, reject) => {

    db.run(

      `UPDATE businesses SET stripe_account_id = ? WHERE id = ?`,

      [stripeAccountId, business_id],

      (err) => (err ? reject(err) : resolve())

    );

  });

};



const setStripeOnboarded = (business_id, onboarded) => {

  return new Promise((resolve, reject) => {

    db.run(

      `UPDATE businesses SET stripe_onboarded = ? WHERE id = ?`,

      [onboarded ? 1 : 0, business_id],

      (err) => (err ? reject(err) : resolve())

    );

  });

};



// Stores a successful Google Calendar connection - the refresh token
// (plaintext, same precedent as stripe_account_id above), the connected
// account's email for display in Settings, and flips the connected flag.
const setGoogleCalendarConnection = (business_id, refreshToken, email) => {

  return new Promise((resolve, reject) => {

    db.run(

      `
      UPDATE businesses
      SET google_calendar_connected = 1,
          google_refresh_token = ?,
          google_calendar_email = ?
      WHERE id = ?
      `,

      [refreshToken, email || null, business_id],

      (err) => (err ? reject(err) : resolve())

    );

  });

};



// Disconnects Google Calendar - clears the stored refresh token and
// email and flips the connected flag back off. Does not attempt to
// revoke the token with Google; a stale unused refresh token isn't a
// meaningful risk here (see the migration's comment on plaintext storage
// matching Stripe's existing precedent), and Google tokens naturally stop
// being usable if the owner revokes access from their Google account
// directly.
const clearGoogleCalendarConnection = (business_id) => {

  return new Promise((resolve, reject) => {

    db.run(

      `
      UPDATE businesses
      SET google_calendar_connected = 0,
          google_refresh_token = NULL,
          google_calendar_email = NULL
      WHERE id = ?
      `,

      [business_id],

      (err) => (err ? reject(err) : resolve())

    );

  });

};



const slugExists = (slug) => {

  return new Promise((resolve, reject) => {

    db.get(

      `SELECT id FROM businesses WHERE slug = ?`,

      [slug],

      (err, row) => (err ? reject(err) : resolve(!!row))

    );

  });

};



const slugify = (name) => {

  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "business";

};



const generateUniqueSlug = async (name) => {

  const base = slugify(name);

  let candidate = base;
  let suffix = 1;

  while (await slugExists(candidate)) {

    suffix += 1;
    candidate = `${base}-${suffix}`;

  }

  return candidate;

};



module.exports = {

  getBusinessById,

  getBusinessBySlug,

  setStripeAccountId,

  setStripeOnboarded,

  setGoogleCalendarConnection,

  clearGoogleCalendarConnection,

  slugify,

  generateUniqueSlug

};
