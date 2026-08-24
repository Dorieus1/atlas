const express = require("express");

const router = express.Router();

const rateLimiter = require("../middleware/rateLimiter");
const authMiddleware = require("../middleware/authMiddleware");


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


router.post(
  "/login",
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
  inviteTeammate
);


router.delete(
  "/teammates/:id",
  authMiddleware,
  removeTeammate
);


router.put(
  "/password",
  authMiddleware,
  changePassword
);



module.exports = router;
