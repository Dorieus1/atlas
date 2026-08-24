const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  createQuote,
  getQuotes,
  getCustomerQuotes,
  getQuote,
  updateQuote,
  deleteQuote
} = require("../controllers/quoteController");


router.post(
  "/",
  authMiddleware,
  createQuote
);

router.get(
  "/",
  authMiddleware,
  getQuotes
);

router.get(
  "/customer/:customer_id",
  authMiddleware,
  getCustomerQuotes
);

router.get(
  "/:id",
  authMiddleware,
  getQuote
);

router.patch(
  "/:id",
  authMiddleware,
  updateQuote
);

router.delete(
  "/:id",
  authMiddleware,
  deleteQuote
);


module.exports = router;
