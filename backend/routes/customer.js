const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");



const {

  createCustomer,

  getCustomers,

  getCustomerById,
  getCustomerTimeline,
  getCustomersByBusiness,
  deleteCustomer,
  getTrashedCustomers,
  getPossibleDuplicates,
  mergeCustomers,
  restoreCustomer,
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



router.post(
  "/merge",
  authMiddleware,
  mergeCustomers
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



// Same reasoning as "/trash" just above - a literal path segment
// registered ahead of GET "/:id" so "duplicates" is never swallowed as
// an :id value.
router.get(
  "/duplicates",
  authMiddleware,
  getPossibleDuplicates
);



router.get(
  "/:id",
  authMiddleware,
  getCustomerById
);



router.get(
  "/:id/timeline",
  authMiddleware,
  getCustomerTimeline
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