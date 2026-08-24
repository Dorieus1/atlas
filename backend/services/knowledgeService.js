const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");


const createKnowledgeEntry = (business_id, title, content) => {

  return new Promise((resolve, reject) => {

    const id = uuidv4();

    db.run(

      `INSERT INTO knowledge (id, business_id, title, content) VALUES (?, ?, ?, ?)`,

      [id, business_id, title, content],

      (err) => (err ? reject(err) : resolve(id))

    );

  });

};



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
  createKnowledgeEntry,
};