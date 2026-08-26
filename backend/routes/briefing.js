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

          console.error(err);

          return res.status(500).json({

            error: "Something went wrong. Please try again."

          });

        }




        // Only human-relevant fields go into the prompt - raw rows carry
        // internal ids, foreign keys, and ISO timestamps that the model
        // will otherwise happily quote straight back in its briefing
        // (e.g. "Lead ID: 1248b11a-92fb-...", "Due date:
        // 2026-08-24T18:58:19.673Z"), which reads like a leaked database
        // dump to the business owner, not a written summary.
        const leadsForPrompt = leads.map((lead) => ({
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          interest: lead.interest,
          status: lead.status,
          priority: lead.priority
        }));

        const tasksForPrompt = tasks.map((task) => ({
          title: task.title,
          description: task.description,
          status: task.status,
          due_date: task.due_date ? new Date(task.due_date).toLocaleDateString() : null
        }));

        const prompt = `

You are Atlas AI.

Create a short daily business briefing using ONLY the real data
provided below. Do not invent, assume, or use example leads,
companies, contacts, or dollar amounts that are not present in the
LEADS or TASKS data. If LEADS is an empty list, say plainly that
there are no leads yet -- do not make any up. Same for TASKS.

Write in plain, professional prose for a business owner - never
mention database fields, ids, or technical terms, and never include
any identifier-looking value even if one appears in the data below.

Include:

- Important leads (only if LEADS is non-empty)
- Tasks needing attention (only if TASKS is non-empty)
- Recommended priority action


LEADS:

${JSON.stringify(leadsForPrompt)}


TASKS:

${JSON.stringify(tasksForPrompt)}


Write a professional briefing based strictly on the data above.

`;





        try {

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

        } catch (aiError) {

          console.error(aiError);

          res.status(500).json({

            error: "Failed to generate briefing"

          });

        }



      }


    );



  } catch(error){


    console.error(error);


    res.status(500).json({

      error: "Something went wrong. Please try again."

    });


  }


});



module.exports = router;