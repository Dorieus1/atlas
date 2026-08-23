const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");



const createCustomer = (

  business_id,
  name,
  email

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
        email
      )
      VALUES (?, ?, ?, ?)
      `,

      [
        id,
        business_id,
        name,
        email || null
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





const getCustomers = () => {


  return new Promise((resolve, reject) => {


    db.all(

      `
      SELECT *
      FROM customers
      ORDER BY created_at DESC
      `,

      [],


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



module.exports = {

  createCustomer,
  getCustomers,
  getCustomerById,
  getCustomersByBusiness
};