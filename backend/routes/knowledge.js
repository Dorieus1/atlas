const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  createKnowledge,
  getKnowledge,
  updateKnowledge,
  deleteKnowledge,
  importKnowledge
} = require("../controllers/knowledgeController");


router.post("/", authMiddleware, createKnowledge);

router.post("/import", authMiddleware, importKnowledge);

router.get("/:business_id", authMiddleware, getKnowledge);

router.put("/:id", authMiddleware, updateKnowledge);

router.delete("/:id", authMiddleware, deleteKnowledge);


module.exports = router;