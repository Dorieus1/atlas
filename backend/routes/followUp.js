const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const rateLimiter = require("../middleware/rateLimiter");

const {
  createFollowUp
} = require("../controllers/followUpController");



router.post(
  "/",
  authMiddleware,
  rateLimiter(30, 60 * 1000),
  createFollowUp
);



module.exports = router;
