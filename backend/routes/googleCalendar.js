const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const requireOwner = require("../middleware/requireOwner");

const {
  startConnect,
  handleCallback,
  getStatus,
  disconnect
} = require("../controllers/googleCalendarController");


router.get(
  "/connect",
  authMiddleware,
  requireOwner,
  startConnect
);

// Hit by Google's own redirect, not an authenticated frontend call - no
// authMiddleware here. See handleCallback's comment for how the business
// is identified instead.
router.get(
  "/callback",
  handleCallback
);

router.get(
  "/status",
  authMiddleware,
  getStatus
);

router.post(
  "/disconnect",
  authMiddleware,
  requireOwner,
  disconnect
);


module.exports = router;
