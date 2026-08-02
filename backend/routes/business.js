const express = require("express");

const router = express.Router();


const {
  createBusiness,
  getBusinesses
} = require("../controllers/businessController");


router.post("/", createBusiness);

router.get("/", getBusinesses);


module.exports = router;