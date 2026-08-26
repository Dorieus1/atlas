const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const rateLimiter = require("../middleware/rateLimiter");

const {
  generateAIResponse
} = require("../services/aiService");

const { getBusinessKnowledge } = require("../services/knowledgeService");
const { getBusinessById } = require("../services/businessService");



router.post("/", authMiddleware, rateLimiter(30, 60 * 1000), async(req,res)=>{


  try {


    const {

      customer,

      interest

    } = req.body;


    if (!customer || !interest) {

      return res.status(400).json({

        error: "customer and interest required"

      });

    }


    // Same knowledge/business grounding the live customer-facing chat
    // already gets (see chatService.js) - without this, the model has
    // "No additional business information available" and, asked to
    // write a message "focused on booking the next step" for an
    // interest that often mentions pricing, would sometimes invent a
    // plausible-looking price instead of the real one on file. A real
    // bug found during live testing: a $89 knowledge-base price came
    // back as an invented "$75-$125" range here.
    const business_id = req.user.business_id;

    const [knowledge, business] = await Promise.all([
      getBusinessKnowledge(business_id),
      getBusinessById(business_id)
    ]);

    const message = await generateAIResponse(

      `
Create a professional follow-up message
for this customer.

Customer:
${customer}

Interest:
${interest}

Make it friendly and focused on booking
the next step. If pricing is relevant, use ONLY a price
that appears in the business information below - never
estimate, round, or invent a price or price range. If no
specific price is available, don't mention one at all.
      `,

      [],

      knowledge,

      business

    );



    res.json({

      message

    });



  } catch(error){


    console.error(error);


    res.status(500).json({

      error: "Something went wrong. Please try again."

    });


  }


});


module.exports = router;