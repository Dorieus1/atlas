const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getTourStatus,
  completeTour
} = require("../controllers/tourController");


router.get(
  "/status",
  authMiddleware,
  getTourStatus
);

router.patch(
  "/complete",
  authMiddleware,
  completeTour
);


module.exports = router;
