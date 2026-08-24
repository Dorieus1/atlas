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
    services,
    review_link

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
      services = ?,
      review_link = ?

    WHERE id = ?

    `,

    [

      name.trim(),
      phone,
      email,
      address,
      industry,
      services,
      review_link,
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





const deleteIncompleteBusiness = (req, res) => {

  const { id } = req.params;

  // Only ever allowed for a business that has no logins yet. A business
  // in that state can't have any real data or users attached to it - it
  // can only exist because a signup attempt created the business row and
  // then failed on the next step (e.g. a duplicate email), leaving it
  // permanently orphaned with no way to ever log in and use it. This is
  // narrow and safe on purpose: it can never touch a business anyone is
  // actually using. This route has no auth (the failed signup that
  // triggers it has no valid session yet), so the delete is also capped
  // to businesses created in the last hour to keep the unauthenticated
  // window as small as the real cleanup case actually needs.
  db.get(

    `
    SELECT COUNT(*) AS count
    FROM users
    WHERE business_id = ?
    `,

    [id],

    (err, row) => {

      if (err) {

        console.error(err);

        return res.status(500).json({
          error: "Something went wrong. Please try again."
        });

      }

      if (row.count > 0) {

        return res.status(400).json({
          error: "This business already has an account and can't be removed this way"
        });

      }

      db.run(

        `
        DELETE FROM businesses
        WHERE id = ?
        AND created_at >= datetime('now', '-1 hour')
        `,

        [id],

        function(deleteErr) {

          if (deleteErr) {

            console.error(deleteErr);

            return res.status(500).json({
              error: "Something went wrong. Please try again."
            });

          }

          res.json({
            message: "Business removed"
          });

        }

      );

    }

  );

};



module.exports = {

  createBusiness,

  getBusinesses,

  updateBusiness,

  deleteIncompleteBusiness

};