const express = require("express");

const router = express.Router();

const {
  saveConversation,
  getConversationHistory,
  getAllConversations
} = require("../controllers/conversationController");


router.post("/", saveConversation);

router.get("/", getAllConversations);

router.get("/:customer_id", getConversationHistory);

router.get("/", getAllConversations);

module.exports = router;