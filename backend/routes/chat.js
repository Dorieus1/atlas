const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const rateLimiter = require("../middleware/rateLimiter");
const { chatResponse } = require("../controllers/chatController");

router.post("/", authMiddleware, rateLimiter(30, 60 * 1000), chatResponse);

module.exports = router;