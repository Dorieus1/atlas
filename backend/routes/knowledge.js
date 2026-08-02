const express = require("express");

const router = express.Router();


const {
  createKnowledge,
  getKnowledge
} = require("../controllers/knowledgeController");


router.post("/", createKnowledge);

router.get("/:business_id", getKnowledge);


module.exports = router;