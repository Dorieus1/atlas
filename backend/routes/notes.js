const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  addNote,
  getNotes,
  editNote,
  removeNote
} = require("../controllers/noteController");



router.post("/", authMiddleware, addNote);

router.get("/:customer_id", authMiddleware, getNotes);

router.put("/:id", authMiddleware, editNote);

router.delete("/:id", authMiddleware, removeNote);



module.exports = router;