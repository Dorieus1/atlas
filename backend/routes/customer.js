const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");



const {

  createCustomer,

  getCustomers,

  getCustomerById,
  getCustomersByBusiness,
  deleteCustomer

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



router.delete(
  "/:id",
  authMiddleware,
  deleteCustomer
);




module.exports = router;