const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");



const {

  createCustomer,

  getCustomers,

  getCustomerById,
  getCustomersByBusiness,
  deleteCustomer,
  updateCustomer,
  addCustomerTag,
  removeCustomerTag

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



router.put(
  "/:id",
  authMiddleware,
  updateCustomer
);



router.post(
  "/:id/tags",
  authMiddleware,
  addCustomerTag
);



router.delete(
  "/:id/tags/:tagId",
  authMiddleware,
  removeCustomerTag
);




module.exports = router;