const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  createQuote,
  getQuotes,
  exportQuotesCsv,
  getCustomerQuotes,
  getQuote,
  sendQuote,
  addQuoteExpense,
  deleteQuoteExpense,
  addQuotePayment,
  deleteQuotePayment,
  updateQuote,
  deleteQuote,
  downloadQuotePdf,
  signQuoteInPerson
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

router.post(
  "/:id/send",
  authMiddleware,
  sendQuote
);

router.post(
  "/:id/expenses",
  authMiddleware,
  addQuoteExpense
);

router.delete(
  "/:id/expenses/:expenseId",
  authMiddleware,
  deleteQuoteExpense
);

router.post(
  "/:id/payments",
  authMiddleware,
  addQuotePayment
);

router.delete(
  "/:id/payments/:paymentId",
  authMiddleware,
  deleteQuotePayment
);

router.patch(
  "/:id",
  authMiddleware,
  updateQuote
);

router.post(
  "/:id/sign",
  authMiddleware,
  signQuoteInPerson
);

router.delete(
  "/:id",
  authMiddleware,
  deleteQuote
);


module.exports = router;
