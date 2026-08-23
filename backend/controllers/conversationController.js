const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");

const { getCustomerById } = require("../services/customerService");

const saveConversation = async (req, res) => {
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

  const customer = await getCustomerById(customer_id, req.user.business_id);

  if (!customer) {
    return res.status(404).json({
      error: "Customer not found"
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


const getConversationHistory = async (req, res) => {
  const { customer_id } = req.params;

  const customer = await getCustomerById(customer_id, req.user.business_id);

  if (!customer) {
    return res.status(404).json({
      error: "Customer not found"
    });
  }

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
    `SELECT conversations.*
     FROM conversations
     JOIN customers ON customers.id = conversations.customer_id
     WHERE customers.business_id = ?
     ORDER BY conversations.created_at ASC`,
    [req.user.business_id],
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