const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");



const {

  createCustomer,

  getCustomers,

  getCustomerById,
  getCustomersByBusiness,
  deleteCustomer,
  getTrashedCustomers,
  restoreCustomer,
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



// Registered ahead of GET "/:id" so "trash" is never swallowed as an
// :id value.
router.get(
  "/trash",
  authMiddleware,
  getTrashedCustomers
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



router.post(
  "/:id/restore",
  authMiddleware,
  restoreCustomer
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