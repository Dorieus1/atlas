const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  createQuote,
  getQuotes,
  exportQuotesCsv,
  getCustomerQuotes,
  getQuote,
  updateQuote,
  deleteQuote,
  downloadQuotePdf
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

// Must be registered before the /:id route below - Express matches
// routes in order, and "export.csv" would otherwise be swallowed as an
// :id value.
router.get(
  "/export.csv",
  authMiddleware,
  exportQuotesCsv
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

router.get(
  "/:id/pdf",
  authMiddleware,
  downloadQuotePdf
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
