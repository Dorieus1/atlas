const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");


const createKnowledge = (req, res) => {

  const {
    business_id,
    title,
    content
  } = req.body;


  if (!business_id || !title || !content) {
    return res.status(400).json({
      error: "business_id, title, and content are required"
    });
  }


  const id = uuidv4();


  db.run(
    `INSERT INTO knowledge
    (id, business_id, title, content)
    VALUES (?, ?, ?, ?)`,
    [
      id,
      business_id,
      title,
      content
    ],
    function(err) {

      if (err) {
        return res.status(500).json({
          error: err.message
        });
      }


      res.status(201).json({
        id,
        message: "Knowledge saved"
      });

    }
  );

};



const getKnowledge = (req, res) => {

  const {
    business_id
  } = req.params;


  db.all(
    `SELECT *
     FROM knowledge
     WHERE business_id = ?
     ORDER BY created_at ASC`,
    [
      business_id
    ],
    (err, rows) => {

      if (err) {
        return res.status(500).json({
          error: err.message
        });
      }


      res.json(rows);

    }
  );

};



module.exports = {
  createKnowledge,
  getKnowledge
};