const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");


const createKnowledge = (req, res) => {

  const {
    title,
    content
  } = req.body;

  const business_id = req.user.business_id;


  if (!title || !title.trim() || !content || !content.trim()) {
    return res.status(400).json({
      error: "title and content are required"
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
      title.trim(),
      content.trim()
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


  if (business_id !== req.user.business_id) {
    return res.status(403).json({
      error: "Forbidden"
    });
  }


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



const updateKnowledge = (req, res) => {

  const {
    title,
    content
  } = req.body;

  const business_id = req.user.business_id;

  const { id } = req.params;


  if (!title || !title.trim() || !content || !content.trim()) {
    return res.status(400).json({
      error: "title and content are required"
    });
  }


  db.run(
    `UPDATE knowledge
     SET title = ?, content = ?
     WHERE id = ? AND business_id = ?`,
    [
      title.trim(),
      content.trim(),
      id,
      business_id
    ],
    function(err) {

      if (err) {
        return res.status(500).json({
          error: err.message
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          error: "Knowledge entry not found"
        });
      }

      res.json({
        message: "Knowledge updated"
      });

    }
  );

};



const deleteKnowledge = (req, res) => {

  const business_id = req.user.business_id;

  const { id } = req.params;


  db.run(
    `DELETE FROM knowledge
     WHERE id = ? AND business_id = ?`,
    [
      id,
      business_id
    ],
    function(err) {

      if (err) {
        return res.status(500).json({
          error: err.message
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          error: "Knowledge entry not found"
        });
      }

      res.json({
        message: "Knowledge deleted"
      });

    }
  );

};



module.exports = {
  createKnowledge,
  getKnowledge,
  updateKnowledge,
  deleteKnowledge
};