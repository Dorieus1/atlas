const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  addNote,
  getNotes
} = require("../controllers/noteController");



router.post("/", authMiddleware, addNote);

router.get("/:customer_id", authMiddleware, getNotes);



module.exports = router;