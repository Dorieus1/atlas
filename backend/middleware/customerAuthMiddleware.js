const jwt = require("jsonwebtoken");
const db = require("../../database/db");


// Parallel to authMiddleware.js, but for a returning customer's portal
// session instead of a business owner's account. Kept as a separate
// middleware (rather than branching inside authMiddleware) so a customer
// token can never accidentally be accepted on a business route or vice
// versa - the two token shapes and the tables they're checked against
// don't overlap.
const customerAuthMiddleware = (req, res, next) => {

  const authHeader = req.headers.authorization;

  if (!authHeader) {

    return res.status(401).json({
      error: "No token provided"
    });

  }

  const token = authHeader.split(" ")[1];

  if (!token) {

    return res.status(401).json({
      error: "Invalid token"
    });

  }

  try {

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== "customer") {

      return res.status(401).json({
        error: "Invalid token"
      });

    }

    db.get(

      `
      SELECT id
      FROM customers
      WHERE id = ? AND business_id = ?
      `,

      [decoded.customer_id, decoded.business_id],

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

        req.customer = decoded;
        next();

      }

    );

  } catch (error) {

    return res.status(401).json({
      error: "Invalid token"
    });

  }

};


module.exports = customerAuthMiddleware;
