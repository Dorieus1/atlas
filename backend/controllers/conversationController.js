const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");

const saveConversation = (req, res) => {
  const {
    customer_id,
    message,
    response
  } = req.body;

  if (!customer_id || !message) {
    return res.status(400).json({
      error: "customer_id and message are required"
    });
  }

  const id = uuidv4();

  db.run(
    `INSERT INTO conversations
    (id, customer_id, message, response)
    VALUES (?, ?, ?, ?)`,
    [
      id,
      customer_id,
      message,
      response || null
    ],
    function(err) {
      if (err) {
        return res.status(500).json({
          error: err.message
        });
      }

      res.status(201).json({
        id,
        message: "Conversation saved"
      });
    }
  );
};


const getConversationHistory = (req, res) => {
  const { customer_id } = req.params;

  db.all(
    `SELECT *
     FROM conversations
     WHERE customer_id = ?
     ORDER BY created_at ASC`,
    [customer_id],
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

const getAllConversations = (req, res) => {

  db.all(
    `SELECT *
     FROM conversations
     ORDER BY created_at ASC`,
    [],
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
  saveConversation,
  getConversationHistory,
  getAllConversations
};