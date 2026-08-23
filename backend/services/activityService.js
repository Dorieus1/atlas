const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");



const createActivity = (
  customer_id,
  type,
  content
) => {

  return new Promise((resolve, reject) => {


    const id = uuidv4();



    db.run(

      `
      INSERT INTO activities
      (
        id,
        customer_id,
        type,
        content
      )
      VALUES (?, ?, ?, ?)
      `,

      [
        id,
        customer_id,
        type,
        content
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



const getCustomerActivities = (
  customer_id
) => {

  return new Promise((resolve, reject) => {


    db.all(

      `
      SELECT *
      FROM activities
      WHERE customer_id = ?
      ORDER BY created_at DESC
      `,

      [
        customer_id
      ],


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

  createActivity,

  getCustomerActivities

};