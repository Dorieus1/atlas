const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  createMemory,
  getMemories,
  getAllMemories
} = require("../controllers/memoryController");


router.post("/", authMiddleware, createMemory);

router.get("/", authMiddleware, getAllMemories);

router.get("/:customer_id", authMiddleware, getMemories);


module.exports = router;