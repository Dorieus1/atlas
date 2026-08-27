const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  createServiceAgreement,
  getCustomerServiceAgreements,
  getAllServiceAgreements,
  updateServiceAgreementStatus,
  renewServiceAgreement
} = require("../controllers/serviceAgreementController");


router.post(
  "/",
  authMiddleware,
  createServiceAgreement
);

router.get(
  "/",
  authMiddleware,
  getAllServiceAgreements
);

router.get(
  "/customer/:customer_id",
  authMiddleware,
  getCustomerServiceAgreements
);

router.patch(
  "/:id/status",
  authMiddleware,
  updateServiceAgreementStatus
);

router.post(
  "/:id/renew",
  authMiddleware,
  renewServiceAgreement
);


module.exports = router;
