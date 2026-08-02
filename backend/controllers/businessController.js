const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");


const createBusiness = (req, res) => {
  const { name } = req.body;


  if (!name) {
    return res.status(400).json({
      error: "Business name is required",
    });
  }


  const id = uuidv4();


  db.run(
    "INSERT INTO businesses (id, name) VALUES (?, ?)",
    [id, name],
    function (err) {

      if (err) {
        return res.status(500).json({
          error: err.message,
        });
      }


      res.status(201).json({
        id,
        name,
        message: "Business created successfully",
      });

    }
  );
};



const getBusinesses = (req, res) => {

  db.all(
    "SELECT * FROM businesses",
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
  createBusiness,
  getBusinesses,
};