const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const requireOwner = require("../middleware/requireOwner");

const {
  startOnboarding,
  getConnectStatus
} = require("../controllers/stripeConnectController");


router.post(
  "/start",
  authMiddleware,
  requireOwner,
  startOnboarding
);

router.get(
  "/status",
  authMiddleware,
  getConnectStatus
);


module.exports = router;
