const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const rateLimiter = require("../middleware/rateLimiter");

const {
  uploadPhoto,
  getCustomerPhotos,
  removePhoto
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

router.delete(
  "/:id",
  authMiddleware,
  removePhoto
);


module.exports = router;
