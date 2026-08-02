const express = require("express");
const router = express.Router();

const { chatResponse } = require("../controllers/chatController");

router.post("/", chatResponse);

module.exports = router;