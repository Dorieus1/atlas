const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");



const {

  createCustomer,

  getCustomers,

  getCustomerById,
  getCustomersByBusiness

} = require("../controllers/customerController");




router.post(
  "/",
  authMiddleware,
  createCustomer
);



router.get(
  "/",
  authMiddleware,
  getCustomers
);



router.get(
  "/:id",
  authMiddleware,
  getCustomerById
);




module.exports = router;