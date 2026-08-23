const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  createBusiness,
  getBusinesses,
  updateBusiness
} = require("../controllers/businessController");



router.post("/", createBusiness);


router.get("/", authMiddleware, getBusinesses);


router.put("/", authMiddleware, updateBusiness);



module.exports = router;