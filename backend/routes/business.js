const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const rateLimiter = require("../middleware/rateLimiter");

const {
  createBusiness,
  getBusinesses,
  updateBusiness,
  deleteIncompleteBusiness
} = require("../controllers/businessController");



router.post("/", createBusiness);


router.get("/", authMiddleware, getBusinesses);


router.put("/", authMiddleware, updateBusiness);


router.delete(
  "/:id/incomplete",
  rateLimiter(10, 60 * 60 * 1000),
  deleteIncompleteBusiness
);



module.exports = router;