const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const rateLimiter = require("../middleware/rateLimiter");
const { askAssistant } = require("../services/assistantService");


const MAX_QUESTION_LENGTH = 500;


router.post("/ask", authMiddleware, rateLimiter(15, 60 * 1000), async (req, res) => {

  try {

    const { question } = req.body;

    if (!question || !question.trim()) {

      return res.status(400).json({
        error: "Enter a question."
      });

    }

    if (question.trim().length > MAX_QUESTION_LENGTH) {

      return res.status(400).json({
        error: `Keep questions under ${MAX_QUESTION_LENGTH} characters.`
      });

    }

    const answer = await askAssistant(req.user.business_id, question.trim());

    res.json({ answer });

  } catch (error) {

    console.error("ASK ASSISTANT ERROR:", error);

    res.status(500).json({
      error: "Couldn't get an answer right now. Please try again."
    });

  }

});


module.exports = router;
