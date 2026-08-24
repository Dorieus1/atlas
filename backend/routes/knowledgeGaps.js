const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  listKnowledgeGaps,
  approveKnowledgeGap,
  dismissKnowledgeGap
} = require("../controllers/knowledgeGapController");


router.get(
  "/",
  authMiddleware,
  listKnowledgeGaps
);

router.post(
  "/:id/approve",
  authMiddleware,
  approveKnowledgeGap
);

router.post(
  "/:id/dismiss",
  authMiddleware,
  dismissKnowledgeGap
);


module.exports = router;
