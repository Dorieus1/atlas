const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const rateLimiter = require("../middleware/rateLimiter");

const {
  sendReviewRequest,
  getCustomerReviewRequests
} = require("../controllers/reviewRequestController");


router.post(
  "/",
  authMiddleware,
  rateLimiter(20, 60 * 60 * 1000),
  sendReviewRequest
);

router.get(
  "/customer/:customer_id",
  authMiddleware,
  getCustomerReviewRequests
);


module.exports = router;
