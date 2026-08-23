const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  saveConversation,
  getConversationHistory,
  getAllConversations
} = require("../controllers/conversationController");


router.post("/", authMiddleware, saveConversation);

router.get("/", authMiddleware, getAllConversations);

router.get("/:customer_id", authMiddleware, getConversationHistory);

module.exports = router;