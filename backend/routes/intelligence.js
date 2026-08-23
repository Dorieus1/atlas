const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getDashboardIntelligence
} = require("../controllers/intelligenceController");

router.get("/", authMiddleware, getDashboardIntelligence);

module.exports = router;