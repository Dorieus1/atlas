const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");


const createMemory = (customer_id, memory) => {

  return new Promise((resolve, reject) => {

    const id = uuidv4();

    db.run(
      `INSERT INTO memories
      (id, customer_id, memory)
      VALUES (?, ?, ?)`,
      [
        id,
        customer_id,
        memory
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
  createMemory,
};