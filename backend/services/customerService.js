const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");


const runAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {

    db.run(sql, params, function(err) {

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

    db.all(sql, params, (err, rows) => {

      if (err) {

        reject(err);

      } else {

        resolve(rows);

      }

    });

  });

};



const createCustomer = (

  business_id,
  name,
  email,
  phone,
  created_by_user_id = null,
  created_by_name = null

) => {


  return new Promise((resolve, reject) => {


    const id = uuidv4();



    db.run(

      `
      INSERT INTO customers
      (
        id,
        business_id,
        name,
        email,
        phone,
        created_by_user_id,
        created_by_name
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,

      [
        id,
        business_id,
        name,
        email || null,
        phone || null,
        created_by_user_id || null,
        created_by_name || null
      ],


      function(err) {


        if (err) {

          reject(err);

        } else {

          resolve(id);

        }


      }


    );


  });


};





const getCustomerById = (

  id,
  business_id

) => {


  return new Promise((resolve, reject) => {


    db.get(

      `
      SELECT *
      FROM customers
      WHERE id = ?
      AND business_id = ?
      `,

      [

        id,

        business_id

      ],


      (err, row) => {


        if (err) {

          reject(err);

        } else {

          resolve(row);

        }


      }


    );


  });


};

const getCustomerByEmail = (business_id, email) => {

  return new Promise((resolve, reject) => {

    db.get(

      `
      SELECT *
      FROM customers
      WHERE business_id = ?
      AND LOWER(email) = LOWER(?)
      `,

      [business_id, email],

      (err, row) => (err ? reject(err) : resolve(row))

    );

  });

};



// Trashed-customer-excluding variants of the two lookups above, for the
// handful of call sites where a soft-deleted customer must be treated as
// if they don't exist at all: the customer-portal auth gate, magic-link
// login (both requesting one and consuming one), and CSV-import
// duplicate detection (so re-importing a trashed customer's email
// creates a fresh active record instead of being silently skipped as
// "already exists"). getCustomerById/getCustomerByEmail stay unfiltered
// for their many staff-facing callers, which intentionally can still
// reach a trashed customer's existing record (see the customer-trash
// feature's design notes).
const getActiveCustomerById = (id, business_id) => {

  return new Promise((resolve, reject) => {

    db.get(

      `
      SELECT *
      FROM customers
      WHERE id = ?
      AND business_id = ?
      AND deleted_at IS NULL
      `,

      [id, business_id],

      (err, row) => (err ? reject(err) : resolve(row))

    );

  });

};

const getActiveCustomerByEmail = (business_id, email) => {

  return new Promise((resolve, reject) => {

    db.get(

      `
      SELECT *
      FROM customers
      WHERE business_id = ?
      AND LOWER(email) = LOWER(?)
      AND deleted_at IS NULL
      `,

      [business_id, email],

      (err, row) => (err ? reject(err) : resolve(row))

    );

  });

};



// Attaches each customer's assigned tags (as a small [{id, name}] array) in
// a single batch query instead of one query per customer.
const attachTagsToCustomers = async (customers, business_id) => {

  if (customers.length === 0) {

    return customers;

  }

  const rows = await allAsync(

    `
    SELECT
      customer_tags.customer_id AS customer_id,
      tags.id AS id,
      tags.name AS name
    FROM customer_tags
    JOIN tags ON tags.id = customer_tags.tag_id
    WHERE customer_tags.business_id = ?
    `,

    [business_id]

  );

  const byCustomer = {};

  rows.forEach((row) => {

    if (!byCustomer[row.customer_id]) {
      byCustomer[row.customer_id] = [];
    }

    byCustomer[row.customer_id].push({
      id: row.id,
      name: row.name
    });

  });

  return customers.map((customer) => ({
    ...customer,
    tags: byCustomer[customer.id] || []
  }));

};



const getCustomersByBusiness = async (business_id, tag_id) => {


  const customers = await new Promise((resolve, reject) => {

    if (tag_id) {

      db.all(

        `
        SELECT DISTINCT customers.*
        FROM customers
        JOIN customer_tags ON customer_tags.customer_id = customers.id
        WHERE customers.business_id = ?
        AND customer_tags.business_id = ?
        AND customer_tags.tag_id = ?
        AND customers.deleted_at IS NULL
        ORDER BY customers.created_at DESC
        `,

        [business_id, business_id, tag_id],

        (err, rows) => {

          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }

        }

      );

    } else {

      db.all(

        `
        SELECT *
        FROM customers
        WHERE business_id = ?
        AND deleted_at IS NULL
        ORDER BY created_at DESC
        `,

        [business_id],

        (err, rows) => {

          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }

        }

      );

    }

  });

  return attachTagsToCustomers(customers, business_id);


};



const getCustomerTags = (customer_id, business_id) => {

  return allAsync(

    `
    SELECT tags.id, tags.name
    FROM customer_tags
    JOIN tags ON tags.id = customer_tags.tag_id
    WHERE customer_tags.customer_id = ?
    AND customer_tags.business_id = ?
    ORDER BY tags.name ASC
    `,

    [customer_id, business_id]

  );

};



const addCustomerTag = (customer_id, tag_id, business_id) => {

  return runAsync(

    `
    INSERT OR IGNORE INTO customer_tags
    (customer_id, tag_id, business_id)
    VALUES (?, ?, ?)
    `,

    [customer_id, tag_id, business_id]

  );

};



const removeCustomerTag = (customer_id, tag_id, business_id) => {

  return runAsync(

    `
    DELETE FROM customer_tags
    WHERE customer_id = ?
    AND tag_id = ?
    AND business_id = ?
    `,

    [customer_id, tag_id, business_id]

  );

};



// Soft delete: moves the customer into the trash instead of destroying
// anything. Nothing else is touched here - no notes, conversations,
// appointments, quotes, photos, etc. are cascaded - because the customer
// isn't actually gone yet and may still be restored. Permanent removal
// (the old cascade this function used to perform inline) now happens
// only in backend/services/customerPurgeService.js, once a trashed
// customer has sat untouched for 30 days.
//
// Scoped to deleted_at IS NULL so this can't "re-trash" (and bump the
// timestamp on) a customer that's already in the trash - that request
// is treated as a 404 by the controller, same as a customer that never
// existed.
const deleteCustomer = async (

  id,
  business_id

) => {

  const result = await runAsync(

    `
    UPDATE customers
    SET deleted_at = ?
    WHERE id = ?
    AND business_id = ?
    AND deleted_at IS NULL
    `,

    [new Date().toISOString(), id, business_id]

  );

  return result.changes > 0;

};



// Clears deleted_at, pulling a trashed customer back out of the trash.
// Scoped to deleted_at IS NOT NULL so restoring a customer that was
// never trashed (or a bogus id, or another business's customer) is a
// 404, not a silent no-op success.
const restoreCustomer = async (

  id,
  business_id

) => {

  const result = await runAsync(

    `
    UPDATE customers
    SET deleted_at = NULL
    WHERE id = ?
    AND business_id = ?
    AND deleted_at IS NOT NULL
    `,

    [id, business_id]

  );

  return result.changes > 0;

};



// This business's trashed customers, most-recently-deleted first, for
// the "Trash" view. Deliberately a separate query from
// getCustomersByBusiness rather than a flag on it - trash is a distinct
// view, not just another filter on the normal customer list.
const getTrashedCustomersByBusiness = (business_id) => {

  return allAsync(

    `
    SELECT *
    FROM customers
    WHERE business_id = ?
    AND deleted_at IS NOT NULL
    ORDER BY deleted_at DESC
    `,

    [business_id]

  );

};



// Groups active customers that share a normalized name, email, or phone.
// Read-only by design: this surfaces likely duplicates for the owner to
// review and act on themselves (edit, tag, or trash one of them) - it
// deliberately does NOT merge anything automatically. A merge would mean
// re-pointing every quote/appointment/lead/note/photo/tag reference from
// one customer to another across several tables in one transaction,
// which is real surgery on core data and deserves its own careful pass,
// not something bolted onto a "find duplicates" feature.
function groupBy(customers, keyFn) {

  const map = new Map();

  customers.forEach((customer) => {

    const key = keyFn(customer);

    if (!key) {
      return;
    }

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key).push(customer);

  });

  return [...map.values()].filter((group) => group.length > 1);

}


const findPossibleDuplicates = async (business_id) => {

  const customers = await allAsync(

    `SELECT id, name, email, phone FROM customers WHERE business_id = ? AND deleted_at IS NULL`,

    [business_id]

  );

  const rawGroups = [

    ...groupBy(customers, (c) => (c.name && c.name.trim() ? c.name.trim().toLowerCase() : null))
      .map((group) => ({ reason: "same name", group })),

    ...groupBy(customers, (c) => (c.email && c.email.trim() ? c.email.trim().toLowerCase() : null))
      .map((group) => ({ reason: "same email", group })),

    // Phone numbers are compared purely by digits so "(602) 300-2312"
    // and "6023002312" still match - a 7-digit floor avoids a couple of
    // near-empty/garbage numbers accidentally "matching" each other.
    ...groupBy(customers, (c) => {
      const digits = (c.phone || "").replace(/\D/g, "");
      return digits.length >= 7 ? digits : null;
    }).map((group) => ({ reason: "same phone", group }))

  ];

  // Two customers who share both a name AND an email would otherwise
  // show up as two separate entries - merge groups covering the exact
  // same set of customers into one entry with combined reasons.
  const merged = [];

  rawGroups.forEach(({ reason, group }) => {

    const idKey = group.map((c) => c.id).sort().join(",");
    const existing = merged.find((m) => m.idKey === idKey);

    if (existing) {
      existing.reasons.push(reason);
    } else {
      merged.push({ idKey, reasons: [reason], customers: group });
    }

  });

  // A shared name is real, common, and genuinely ambiguous evidence -
  // two different people are named "Mike Johnson" far more often than
  // two different people share a phone number or an email address. A
  // name-only match is labeled "low" confidence so the UI can visibly
  // warn that it might just be a coincidence rather than presenting it
  // with the same weight as a phone/email match, which is a very strong
  // signal of the same real person. Strongest reason wins if a group
  // matches on more than one signal.
  return merged.map(({ reasons, customers }) => ({

    reasons,
    customers,
    confidence: reasons.some((r) => r === "same email" || r === "same phone") ? "high" : "low"

  })).sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === "high" ? -1 : 1));

};



const updateCustomer = (

  id,
  business_id,
  name,
  email,
  phone

) => {


  return new Promise((resolve, reject) => {


    db.run(

      `
      UPDATE customers
      SET name = ?, email = ?, phone = ?
      WHERE id = ?
      AND business_id = ?
      `,

      [
        name,
        email || null,
        phone || null,
        id,
        business_id
      ],

      function(err) {

        if (err) {

          reject(err);

        } else {

          resolve(this.changes > 0);

        }

      }

    );


  });


};



module.exports = {

  createCustomer,
  getCustomerById,
  getCustomerByEmail,
  getActiveCustomerById,
  getActiveCustomerByEmail,
  getCustomersByBusiness,
  deleteCustomer,
  restoreCustomer,
  getTrashedCustomersByBusiness,

  findPossibleDuplicates,
  updateCustomer,
  getCustomerTags,
  addCustomerTag,
  removeCustomerTag
};