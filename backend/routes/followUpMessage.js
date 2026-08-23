const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const rateLimiter = require("../middleware/rateLimiter");

const {
  generateAIResponse
} = require("../services/aiService");



router.post("/", authMiddleware, rateLimiter(30, 60 * 1000), async(req,res)=>{


  try {


    const {

      customer,

      interest

    } = req.body;



    const message = await generateAIResponse(

      `
Create a professional follow-up message
for this customer.

Customer:
${customer}

Interest:
${interest}

Make it friendly and focused on booking
the next step.
      `,

      [],

      [],

      null

    );



    res.json({

      message

    });



  } catch(error){


    res.status(500).json({

      error:error.message

    });


  }


});


module.exports = router;