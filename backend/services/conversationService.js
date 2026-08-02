const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");


const saveConversation = (customer_id, message, response) => {

  return new Promise((resolve, reject) => {

    const id = uuidv4();

    db.run(
      `INSERT INTO conversations
      (id, customer_id, message, response)
      VALUES (?, ?, ?, ?)`,
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


module.exports = {
  saveConversation,
};