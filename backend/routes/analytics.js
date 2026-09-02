const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  analytics,
  arAging
} = require("../controllers/analyticsController");



router.get(
  "/",
  authMiddleware,
  analytics
);

router.get(
  "/ar-aging",
  authMiddleware,
  arAging
);



module.exports = router;