const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getCustomerSummary
} = require("../controllers/customerSummaryController");



router.get(
  "/:customer_id",
  authMiddleware,
  getCustomerSummary
);



module.exports = router;