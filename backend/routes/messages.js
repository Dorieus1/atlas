const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const rateLimiter = require("../middleware/rateLimiter");

const {
  generateMessage
} = require("../controllers/messageController");


router.post("/", authMiddleware, rateLimiter(30, 60 * 1000), generateMessage);


module.exports = router;