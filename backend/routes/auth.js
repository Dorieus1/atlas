const express = require("express");

const router = express.Router();

const rateLimiter = require("../middleware/rateLimiter");


const {

  register,

  login,

  forgotPassword,

  resetPassword

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



module.exports = router;