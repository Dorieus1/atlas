const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const { search } = require("../controllers/searchController");


router.get(
  "/",
  authMiddleware,
  search
);


module.exports = router;
