const db = require("../../database/db");


const getCustomerMemories = (customer_id) => {

  return new Promise((resolve, reject) => {

    db.all(
      `SELECT memory
       FROM memories
       WHERE customer_id = ?`,
      [customer_id],
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
  getCustomerMemories,
};