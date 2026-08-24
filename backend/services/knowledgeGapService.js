const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");


const createKnowledgeGap = (

  business_id,
  customer_id,
  question,
  suggestedTitle,
  suggestedContent

) => {

  return new Promise((resolve, reject) => {

    const id = uuidv4();

    db.run(

      `
      INSERT INTO knowledge_gaps
      (id, business_id, customer_id, question, suggested_title, suggested_content)
      VALUES (?, ?, ?, ?, ?, ?)
      `,

      [id, business_id, customer_id || null, question, suggestedTitle, suggestedContent],

      (err) => (err ? reject(err) : resolve(id))

    );

  });

};



const getPendingKnowledgeGaps = (business_id) => {

  return new Promise((resolve, reject) => {

    db.all(

      `
      SELECT *
      FROM knowledge_gaps
      WHERE business_id = ?
      AND status = 'pending'
      ORDER BY created_at DESC
      `,

      [business_id],

      (err, rows) => (err ? reject(err) : resolve(rows))

    );

  });

};



const getKnowledgeGapById = (id, business_id) => {

  return new Promise((resolve, reject) => {

    db.get(

      `SELECT * FROM knowledge_gaps WHERE id = ? AND business_id = ?`,

      [id, business_id],

      (err, row) => (err ? reject(err) : resolve(row))

    );

  });

};



const setKnowledgeGapStatus = (id, business_id, status) => {

  return new Promise((resolve, reject) => {

    db.run(

      `UPDATE knowledge_gaps SET status = ? WHERE id = ? AND business_id = ?`,

      [status, id, business_id],

      function (err) {

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
  createKnowledgeGap,
  getPendingKnowledgeGaps,
  getKnowledgeGapById,
  setKnowledgeGapStatus
};
