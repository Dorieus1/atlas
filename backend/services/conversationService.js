const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");



const saveConversation = (
  customer_id,
  message,
  response
) => {

  return new Promise((resolve, reject) => {

    const id = uuidv4();


    db.run(

      `
      INSERT INTO conversations
      (
        id,
        customer_id,
        message,
        response
      )
      VALUES (?, ?, ?, ?)
      `,

      [
        id,
        customer_id,
        message,
        response
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





const getConversationHistory = (
  customer_id
) => {

  return new Promise((resolve, reject) => {


    db.all(

      `
      SELECT *
      FROM conversations
      WHERE customer_id = ?
      ORDER BY created_at ASC
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





const getAllConversations = () => {

  return new Promise((resolve, reject) => {


    db.all(

      `
      SELECT *
      FROM conversations
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





module.exports = {

  saveConversation,

  getConversationHistory,

  getAllConversations

};