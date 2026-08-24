const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  createBusiness,
  getBusinesses,
  updateBusiness,
  deleteIncompleteBusiness
} = require("../controllers/businessController");



router.post("/", createBusiness);


router.get("/", authMiddleware, getBusinesses);


router.put("/", authMiddleware, updateBusiness);


router.delete("/:id/incomplete", deleteIncompleteBusiness);



module.exports = router;