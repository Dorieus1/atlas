const express = require("express");

const router = express.Router();

const rateLimiter = require("../middleware/rateLimiter");
const customerAuthMiddleware = require("../middleware/customerAuthMiddleware");

const {
  getPortalBusinessHandler,
  requestLogin,
  verifyLogin,
  getMe,
  requestAppointment,
  getMyAppointments,
  getMyQuotes,
  getMyPhotos
} = require("../controllers/portalController");


// The /account/* routes are registered before the /:slug catch-all so a
// business whose slug happened to collide with a fixed segment could never
// shadow them - not a real risk today since /account has two path segments
// and /:slug only matches one, but keeping the specific routes first is a
// cheap guard against that ever becoming one.

router.get(
  "/account/me",
  customerAuthMiddleware,
  getMe
);

router.get(
  "/account/appointments",
  customerAuthMiddleware,
  getMyAppointments
);

router.post(
  "/account/appointments",
  customerAuthMiddleware,
  requestAppointment
);

router.get(
  "/account/quotes",
  customerAuthMiddleware,
  getMyQuotes
);

router.get(
  "/account/photos",
  customerAuthMiddleware,
  getMyPhotos
);


// No authMiddleware below - a customer has no session yet when hitting
// these. Each handler resolves the business from :slug itself.

router.get(
  "/:slug",
  rateLimiter(60, 60 * 1000),
  getPortalBusinessHandler
);

// Keyed by IP, which can be shared by many customers of many businesses
// behind the same NAT/office network - generous enough that one busy
// shared connection can't lock everyone else out of requesting a link.
router.post(
  "/:slug/login",
  rateLimiter(20, 15 * 60 * 1000),
  requestLogin
);

router.post(
  "/:slug/verify",
  rateLimiter(10, 60 * 1000),
  verifyLogin
);


module.exports = router;
