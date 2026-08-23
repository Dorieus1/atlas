const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");


const createNote = (
  customer_id,
  note
) => {

  return new Promise((resolve, reject) => {

    const id = uuidv4();


    db.run(

      `
      INSERT INTO notes
      (
        id,
        customer_id,
        note
      )
      VALUES (?, ?, ?)
      `,

      [
        id,
        customer_id,
        note
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



const getCustomerNotes = (
  customer_id
) => {

  return new Promise((resolve, reject) => {


    db.all(

      `
      SELECT *
      FROM notes
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

  createNote,

  getCustomerNotes

};