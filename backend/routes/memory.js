const express = require("express");

const router = express.Router();


const {
  createMemory,
  getMemories,
  getAllMemories
} = require("../controllers/memoryController");


router.post("/", createMemory);

router.get("/", getAllMemories);

router.get("/:customer_id", getMemories);


module.exports = router;