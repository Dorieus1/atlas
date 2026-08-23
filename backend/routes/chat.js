const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const { chatResponse } = require("../controllers/chatController");

router.post("/", authMiddleware, chatResponse);

module.exports = router;