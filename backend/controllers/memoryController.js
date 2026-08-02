const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");


const createMemory = (req, res) => {
  const {
    customer_id,
    memory
  } = req.body;


  if (!customer_id || !memory) {
    return res.status(400).json({
      error: "customer_id and memory are required"
    });
  }


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
        return res.status(500).json({
          error: err.message
        });
      }


      res.status(201).json({
        id,
        message: "Memory saved"
      });

    }
  );
};



const getMemories = (req, res) => {

  const {
    customer_id
  } = req.params;


  db.all(
    `SELECT *
     FROM memories
     WHERE customer_id = ?
     ORDER BY created_at ASC`,
    [
      customer_id
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

const getAllMemories = (req, res) => {

  db.all(
    `SELECT *
     FROM memories
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
  createMemory,
  getMemories,
  getAllMemories
};