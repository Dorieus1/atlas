const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getPublicKey,
  subscribe,
  unsubscribe
} = require("../controllers/pushController");


router.get(
  "/public-key",
  authMiddleware,
  getPublicKey
);

router.post(
  "/subscribe",
  authMiddleware,
  subscribe
);

router.post(
  "/unsubscribe",
  authMiddleware,
  unsubscribe
);


module.exports = router;
