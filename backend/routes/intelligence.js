const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const rateLimiter = require("../middleware/rateLimiter");

const {
  getDashboardIntelligence
} = require("../controllers/intelligenceController");

router.get("/", authMiddleware, rateLimiter(30, 60 * 1000), getDashboardIntelligence);

module.exports = router;