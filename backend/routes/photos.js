const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const rateLimiter = require("../middleware/rateLimiter");

const {
  uploadPhoto,
  getCustomerPhotos,
  removePhoto,
  draftEstimateFromPhoto
} = require("../controllers/photoController");


router.post(
  "/",
  authMiddleware,
  rateLimiter(30, 60 * 1000),
  uploadPhoto
);

router.get(
  "/customer/:customer_id",
  authMiddleware,
  getCustomerPhotos
);

// Tighter limit than uploads - a vision call is far more expensive than
// saving a file.
router.post(
  "/:id/draft-estimate",
  authMiddleware,
  rateLimiter(10, 60 * 1000),
  draftEstimateFromPhoto
);

router.delete(
  "/:id",
  authMiddleware,
  removePhoto
);


module.exports = router;
