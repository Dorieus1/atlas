const express = require("express");

const router = express.Router();

const rateLimiter = require("../middleware/rateLimiter");

const {
  getBusinessBySlugHandler,
  startConversation,
  sendPublicMessage,
  getPublicHistory,
  getPublicAvailability,
  createPublicBooking
} = require("../controllers/publicController");


// No authMiddleware anywhere in this file - these are the only routes in
// the app meant to be reachable by someone who has never logged in. Every
// handler resolves its own business from the :slug param and re-verifies
// that any customer_id it's given actually belongs to that business
// before touching anything, since there's no session to trust here.

router.get(
  "/:slug",
  rateLimiter(60, 60 * 1000),
  getBusinessBySlugHandler
);

router.post(
  "/:slug/start",
  rateLimiter(10, 60 * 1000),
  startConversation
);

router.post(
  "/:slug/chat",
  rateLimiter(20, 60 * 1000),
  sendPublicMessage
);

router.get(
  "/:slug/conversations/:customer_id",
  rateLimiter(60, 60 * 1000),
  getPublicHistory
);

router.get(
  "/:slug/availability",
  rateLimiter(60, 60 * 1000),
  getPublicAvailability
);

// Tighter than the read side above - this one actually creates a
// customer and an appointment, matching the same order-of-magnitude
// limit the portal's own requestAppointment-adjacent write endpoints use
// elsewhere in this app.
router.post(
  "/:slug/book",
  rateLimiter(10, 60 * 1000),
  createPublicBooking
);


module.exports = router;
