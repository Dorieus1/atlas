const db = require("../../database/db");


const getBusinessKnowledge = (business_id) => {

  return new Promise((resolve, reject) => {

    db.all(
      `SELECT title, content
       FROM knowledge
       WHERE business_id = ?`,
      [business_id],
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
  getBusinessKnowledge,
};