const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  createKnowledge,
  getKnowledge
} = require("../controllers/knowledgeController");


router.post("/", authMiddleware, createKnowledge);

router.get("/:business_id", authMiddleware, getKnowledge);


module.exports = router;