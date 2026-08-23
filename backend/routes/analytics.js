const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  analytics
} = require("../controllers/analyticsController");



router.get(
  "/",
  authMiddleware,
  analytics
);



module.exports = router;