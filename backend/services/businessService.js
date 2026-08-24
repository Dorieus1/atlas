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

  slugify,

  generateUniqueSlug

};
