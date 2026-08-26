const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const requireOwner = require("../middleware/requireOwner");

const {
  connect,
  getStatus,
  disconnect
} = require("../controllers/appleCalendarController");


router.post(
  "/connect",
  authMiddleware,
  requireOwner,
  connect
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
