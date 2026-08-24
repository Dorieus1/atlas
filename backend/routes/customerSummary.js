const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const rateLimiter = require("../middleware/rateLimiter");

const {
  getCustomerSummary
} = require("../controllers/customerSummaryController");



router.get(
  "/:customer_id",
  authMiddleware,
  rateLimiter(30, 60 * 1000),
  getCustomerSummary
);



module.exports = router;
