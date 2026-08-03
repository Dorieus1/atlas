const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");



const createBusiness = (req, res) => {

  const {
    name,
    phone,
    email,
    address,
    industry,
    services
  } = req.body;


  if (!name) {

    return res.status(400).json({
      error: "Business name is required"
    });

  }


  const id = uuidv4();



  db.run(
    `
    INSERT INTO businesses
    (
      id,
      name,
      phone,
      email,
      address,
      industry,
      services
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      name,
      phone || "",
      email || "",
      address || "",
      industry || "",
      services || ""
    ],
    function(err) {


      if (err) {

        return res.status(500).json({
          error: err.message
        });

      }



      res.status(201).json({

        id,

        message: "Business created"

      });


    }
  );


};





const getBusinesses = (req, res) => {


  db.all(

    `
    SELECT *
    FROM businesses
    ORDER BY created_at DESC
    `,

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






const updateBusiness = (req, res) => {


  const {

    id,

    name,
    phone,
    email,
    address,
    industry,
    services

  } = req.body;



  if (!id) {

    return res.status(400).json({
      error: "Business id required"
    });

  }



  db.run(

    `
    UPDATE businesses

    SET
      name = ?,
      phone = ?,
      email = ?,
      address = ?,
      industry = ?,
      services = ?

    WHERE id = ?

    `,

    [

      name,
      phone,
      email,
      address,
      industry,
      services,
      id

    ],


    function(err) {


      if (err) {

        return res.status(500).json({
          error: err.message
        });

      }



      res.json({

        message: "Business updated"

      });


    }


  );


};





module.exports = {

  createBusiness,

  getBusinesses,

  updateBusiness

};