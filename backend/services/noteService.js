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



const getNoteById = (id) => {

  return new Promise((resolve, reject) => {

    db.get(

      `
      SELECT *
      FROM notes
      WHERE id = ?
      `,

      [
        id
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



const updateNote = (
  id,
  note
) => {

  return new Promise((resolve, reject) => {

    db.run(

      `
      UPDATE notes
      SET note = ?
      WHERE id = ?
      `,

      [
        note,
        id
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



const deleteNote = (id) => {

  return new Promise((resolve, reject) => {

    db.run(

      `
      DELETE FROM notes
      WHERE id = ?
      `,

      [
        id
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

  createNote,

  getCustomerNotes,

  getNoteById,

  updateNote,

  deleteNote

};