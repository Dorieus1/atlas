const express = require("express");

const router = express.Router();

const OpenAI = require("openai");

const authMiddleware = require("../middleware/authMiddleware");
const rateLimiter = require("../middleware/rateLimiter");

const {
  getLeadsByBusiness
} = require("../services/leadService");

const db = require("../../database/db");



const client = new OpenAI({

  apiKey: process.env.OPENAI_API_KEY

});





router.get("/", authMiddleware, rateLimiter(30, 60 * 1000), async (req,res)=>{


  try {


    const leads = await getLeadsByBusiness(req.user.business_id);




    db.all(

      `
      SELECT *
      FROM tasks
      WHERE business_id = ?
      ORDER BY created_at DESC
      `,

      [req.user.business_id],


      async (err,tasks)=>{


        if(err){

          return res.status(500).json({

            error:err.message

          });

        }




        const prompt = `

You are Atlas AI.

Create a short daily business briefing using ONLY the real data
provided below. Do not invent, assume, or use example leads,
companies, contacts, or dollar amounts that are not present in the
LEADS or TASKS data. If LEADS is an empty list, say plainly that
there are no leads yet -- do not make any up. Same for TASKS.

Include:

- Important leads (only if LEADS is non-empty)
- Tasks needing attention (only if TASKS is non-empty)
- Recommended priority action


LEADS:

${JSON.stringify(leads)}


TASKS:

${JSON.stringify(tasks)}


Write a professional briefing based strictly on the data above.

`;





        const response =
          await client.responses.create({

            model:"gpt-5-mini",

            input:prompt

          });





        res.json({

          briefing:
          response.output_text,


          stats:{

            totalLeads:
            leads.length,


            pendingTasks:
            tasks.filter(
              task =>
              task.status === "pending"
            ).length,


            hotLeads:
            leads.filter(
              lead =>
              lead.priority === "hot"
            ).length

          }


        });



      }


    );



  } catch(error){


    console.error(error);


    res.status(500).json({

      error:error.message

    });


  }


});



module.exports = router;