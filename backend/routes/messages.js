const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  generateMessage
} = require("../controllers/messageController");


router.post("/", authMiddleware, generateMessage);


module.exports = router;