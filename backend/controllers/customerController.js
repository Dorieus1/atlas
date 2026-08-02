const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");


const createCustomer = (req, res) => {
  const { business_id, name, email } = req.body;


  if (!business_id) {
    return res.status(400).json({
      error: "business_id is required",
    });
  }


  const id = uuidv4();


  db.run(
    `INSERT INTO customers (id, business_id, name, email)
     VALUES (?, ?, ?, ?)`,
    [id, business_id, name || null, email || null],
    function (err) {

      if (err) {
        return res.status(500).json({
          error: err.message,
        });
      }


      res.status(201).json({
        id,
        business_id,
        name,
        email,
        message: "Customer created successfully",
      });

    }
  );
};



const getCustomers = (req, res) => {

  db.all(
    "SELECT * FROM customers",
    [],
    (err, rows) => {

      if (err) {
        return res.status(500).json({
          error: err.message,
        });
      }


      res.json(rows);

    }
  );

};



module.exports = {
  createCustomer,
  getCustomers,
};