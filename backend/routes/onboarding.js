const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getOnboardingStatus,
  dismissOnboarding
} = require("../controllers/onboardingController");


router.get(
  "/status",
  authMiddleware,
  getOnboardingStatus
);

router.patch(
  "/dismiss",
  authMiddleware,
  dismissOnboarding
);


module.exports = router;
