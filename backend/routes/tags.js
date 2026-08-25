const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  createTag,
  getTags,
  deleteTag
} = require("../controllers/tagController");


router.post("/", authMiddleware, createTag);

router.get("/", authMiddleware, getTags);

router.delete("/:id", authMiddleware, deleteTag);


module.exports = router;
