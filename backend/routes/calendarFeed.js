const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const requireOwner = require("../middleware/requireOwner");
const rateLimiter = require("../middleware/rateLimiter");

const {
  getFeedToken,
  regenerateFeed,
  getFeed
} = require("../controllers/calendarFeedController");


router.get(
  "/token",
  authMiddleware,
  getFeedToken
);

router.post(
  "/regenerate",
  authMiddleware,
  requireOwner,
  regenerateFeed
);

// Hit directly by calendar apps polling a subscribed feed, not the
// frontend - no authMiddleware here, see getFeed's own comment for why.
// Keyed by IP like every other public route (rateLimiter.js) - generous
// enough for a calendar app's normal polling interval, even from a
// shared office connection subscribing more than one device.
router.get(
  "/:token.ics",
  rateLimiter(30, 60 * 1000),
  getFeed
);


module.exports = router;
