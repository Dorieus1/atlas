const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  createFollowUp
} = require("../controllers/followUpController");



router.post(
  "/",
  authMiddleware,
  createFollowUp
);



module.exports = router;