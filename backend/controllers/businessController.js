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


  if (!name || !name.trim()) {

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
      name.trim(),
      phone || "",
      email || "",
      address || "",
      industry || "",
      services || ""
    ],
    function(err) {


      if (err) {

        console.error(err);

        return res.status(500).json({
          error: "Something went wrong. Please try again."
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
    WHERE id = ?
    ORDER BY created_at DESC
    `,

    [req.user.business_id],

    (err, rows) => {


      if (err) {

        console.error(err);

        return res.status(500).json({
          error: "Something went wrong. Please try again."
        });

      }


      res.json(rows);


    }

  );


};






const updateBusiness = (req, res) => {


  const {

    name,
    phone,
    email,
    address,
    industry,
    services

  } = req.body;


  const id = req.user.business_id;


  if (!name || !name.trim()) {

    return res.status(400).json({
      error: "Business name is required"
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

      name.trim(),
      phone,
      email,
      address,
      industry,
      services,
      id

    ],


    function(err) {


      if (err) {

        console.error(err);

        return res.status(500).json({
          error: "Something went wrong. Please try again."
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