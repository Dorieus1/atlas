const express = require("express");

const router = express.Router();


const {
  createBusiness,
  getBusinesses,
  updateBusiness
} = require("../controllers/businessController");



router.post("/", createBusiness);


router.get("/", getBusinesses);


router.put("/", updateBusiness);



module.exports = router;