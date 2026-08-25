const jwt = require("jsonwebtoken");
const db = require("../../database/db");


const authMiddleware = (req, res, next) => {


  const authHeader = req.headers.authorization;



  if (!authHeader) {

    return res.status(401).json({

      error: "No token provided"

    });

  }



  const token =
    authHeader.split(" ")[1];



  if (!token) {

    return res.status(401).json({

      error: "Invalid token"

    });

  }



  try {


    const decoded =
      jwt.verify(

        token,

        process.env.JWT_SECRET

      );



    db.get(

      `
      SELECT id, role
      FROM users
      WHERE id = ? AND business_id = ?
      `,

      [decoded.id, decoded.business_id],

      (err, row) => {

        if (err) {

          console.error(err);

          return res.status(500).json({
            error: "Something went wrong. Please try again."
          });

        }

        if (!row) {

          return res.status(401).json({
            error: "Session expired. Please log in again."
          });

        }

        // Role is read fresh from the DB on every request rather than
        // trusted from the JWT payload. Tokens here are long-lived and
        // can't be revoked early, so baking role into the token would let
        // a just-demoted staff member keep owner-level access until their
        // token naturally expired. Reading it here means a role change
        // takes effect on the user's very next request.
        req.user = decoded;
        req.user.role = row.role;

        next();

      }

    );



  } catch(error) {


    return res.status(401).json({

      error: "Invalid token"

    });


  }


};



module.exports = authMiddleware;