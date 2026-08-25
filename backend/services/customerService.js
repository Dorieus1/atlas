const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const { UPLOAD_DIR } = require("./photoService");
const { withTransaction } = require("../../database/transactionQueue");


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



const deleteCustomer = async (

  id,
  business_id

) => {


  const customer = await getCustomerById(id, business_id);

  if (!customer) {

    return false;

  }

  const photos = await new Promise((resolve, reject) => {

    db.all(
      `SELECT filename FROM photos WHERE customer_id = ? AND business_id = ?`,
      [id, business_id],
      (err, rows) => (err ? reject(err) : resolve(rows))
    );

  });


  // A real transaction, not just sequential statements: if any one of
  // these deletes fails partway through, everything rolls back together
  // instead of leaving the customer gone but some of their notes,
  // leads, or other records silently orphaned behind in the database.
  // Routed through withTransaction so this can never collide with a
  // BEGIN/COMMIT block running concurrently in another service (e.g. a
  // quote being created at the same instant) - see
  // database/transactionQueue.js.
  return withTransaction(async () => {

  await runAsync("BEGIN TRANSACTION");

  try {

    await runAsync(`DELETE FROM notes WHERE customer_id = ?`, [id]);

    await runAsync(`DELETE FROM conversations WHERE customer_id = ?`, [id]);

    await runAsync(`DELETE FROM memories WHERE customer_id = ?`, [id]);

    await runAsync(`DELETE FROM activities WHERE customer_id = ?`, [id]);

    await runAsync(`DELETE FROM leads WHERE customer_id = ?`, [id]);

    await runAsync(`DELETE FROM tasks WHERE customer_id = ?`, [id]);

    await runAsync(`DELETE FROM appointments WHERE customer_id = ?`, [id]);

    await runAsync(
      `DELETE FROM quote_items WHERE quote_id IN (SELECT id FROM quotes WHERE customer_id = ?)`,
      [id]
    );

    await runAsync(`DELETE FROM quotes WHERE customer_id = ?`, [id]);

    await runAsync(`DELETE FROM photos WHERE customer_id = ?`, [id]);

    await runAsync(`DELETE FROM review_requests WHERE customer_id = ?`, [id]);

    await runAsync(`DELETE FROM portal_login_tokens WHERE customer_id = ?`, [id]);

    await runAsync(`DELETE FROM customer_tags WHERE customer_id = ?`, [id]);

    const result = await runAsync(

      `
      DELETE FROM customers
      WHERE id = ?
      AND business_id = ?
      `,

      [id, business_id]

    );

    await runAsync("COMMIT");

    photos.forEach((photo) => {

      fs.unlink(path.join(UPLOAD_DIR, photo.filename), (err) => {

        if (err && err.code !== "ENOENT") {
          console.error("Failed to remove photo file:", err.message);
        }

      });

    });

    return result.changes > 0;

  } catch (err) {

    await runAsync("ROLLBACK").catch(() => {});

    throw err;

  }

  });


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
  getCustomersByBusiness,
  deleteCustomer,
  updateCustomer,
  getCustomerTags,
  addCustomerTag,
  removeCustomerTag
};