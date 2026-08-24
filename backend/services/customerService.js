const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");



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


  return new Promise((resolve, reject) => {


    db.serialize(() => {

      db.run(`DELETE FROM notes WHERE customer_id = ?`, [id]);

      db.run(`DELETE FROM conversations WHERE customer_id = ?`, [id]);

      db.run(`DELETE FROM memories WHERE customer_id = ?`, [id]);

      db.run(`DELETE FROM activities WHERE customer_id = ?`, [id]);

      db.run(`DELETE FROM leads WHERE customer_id = ?`, [id]);

      db.run(`DELETE FROM tasks WHERE customer_id = ?`, [id]);

      db.run(

        `
        DELETE FROM customers
        WHERE id = ?
        AND business_id = ?
        `,

        [id, business_id],

        function(err) {

          if (err) {

            reject(err);

          } else {

            resolve(this.changes > 0);

          }

        }

      );

    });

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
  getCustomersByBusiness,
  deleteCustomer,
  updateCustomer
};