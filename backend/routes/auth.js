const express = require("express");

const router = express.Router();

const rateLimiter = require("../middleware/rateLimiter");
const authMiddleware = require("../middleware/authMiddleware");
const requireOwner = require("../middleware/requireOwner");


const {

  register,

  login,

  forgotPassword,

  resetPassword,

  listTeammates,

  inviteTeammate,

  removeTeammate,

  changePassword

} = require("../controllers/authController");



router.post(
  "/register",
  register
);


// The one endpoint in this file that was missing rate limiting despite
// being the most obvious brute-force target - an attacker with no rate
// limit here can try passwords against a known business owner's email
// as fast as the server can hash them. 25 attempts/15min per IP is
// generous for a real user who mistypes their password a few times
// (and matches the magnitude already accepted for portal login - see
// routes/portal.js), while making a dictionary/brute-force attempt
// impractical.
router.post(
  "/login",
  rateLimiter(25, 15 * 60 * 1000),
  login
);


router.post(
  "/forgot-password",
  rateLimiter(5, 60 * 60 * 1000),
  forgotPassword
);


router.post(
  "/reset-password",
  resetPassword
);


router.get(
  "/teammates",
  authMiddleware,
  listTeammates
);


router.post(
  "/teammates",
  authMiddleware,
  requireOwner,
  inviteTeammate
);


router.delete(
  "/teammates/:id",
  authMiddleware,
  requireOwner,
  removeTeammate
);


router.put(
  "/password",
  authMiddleware,
  changePassword
);



module.exports = router;
