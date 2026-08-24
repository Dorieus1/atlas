const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const { UPLOAD_DIR } = require("./photoService");


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



const createCustomer = (

  business_id,
  name,
  email,
  phone

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
        phone
      )
      VALUES (?, ?, ?, ?, ?)
      `,

      [
        id,
        business_id,
        name,
        email || null,
        phone || null
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



const getCustomersByBusiness = (business_id)=>{


  return new Promise((resolve,reject)=>{


    db.all(

      `
      SELECT *
      FROM customers
      WHERE business_id = ?
      ORDER BY created_at DESC
      `,

      [
        business_id
      ],


      (err,rows)=>{


        if(err){

          reject(err);

        } else {

          resolve(rows);

        }


      }


    );


  });


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
  updateCustomer
};