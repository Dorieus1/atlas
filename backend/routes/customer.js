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
  removeCustomerTag,
  importCustomers

} = require("../controllers/customerController");




router.post(
  "/",
  authMiddleware,
  createCustomer
);



// Registered before "/:id" is reached by any GET, but since this is a
// literal path segment ("/import") rather than a param, it can't be
// shadowed by "/:id" regardless of order.
router.post(
  "/import",
  authMiddleware,
  importCustomers
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