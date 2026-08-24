const {
  generateAIResponse
} = require("../services/aiService");

const {
  getCustomerMemories
} = require("../services/memoryService");

const {
  saveConversation
} = require("../services/conversationService");

const {
  getBusinessKnowledge
} = require("../services/knowledgeService");

const {
  createMemory
} = require("../services/memoryCreationService");

const {
  createActivity
} = require("../services/activityService");

const {
  createLead
} = require("../services/leadService");

const {
  createTask
} = require("../services/taskService");


const db = require("../../database/db");




const chatResponse = async (req, res) => {


  try {


    const {

      customer_id,

      message

    } = req.body;

    const business_id = req.user.business_id;



    if (!customer_id || !message) {

      return res.status(400).json({

        error:
        "customer_id and message are required"

      });

    }



    db.get(

      `
      SELECT *
      FROM customers
      WHERE id = ?
      AND business_id = ?
      `,

      [customer_id, business_id],

      async (err, customer) => {


        if (err) {

          console.error(err);

          return res.status(500).json({

            error: "Something went wrong. Please try again."

          });

        }



        if (!customer) {

          return res.status(404).json({

            error: "Customer not found"

          });

        }



        const memories =
          await getCustomerMemories(customer_id);



        const knowledge =
          await getBusinessKnowledge(business_id);




    db.get(

      `
      SELECT *
      FROM businesses
      WHERE id = ?
      `,

      [business_id],

      async (err, business) => {


        if (err) {

          console.error(err);

          return res.status(500).json({

            error: "Something went wrong. Please try again."

          });

        }


        try {


        const reply =
          await generateAIResponse(

            message,

            memories,

            knowledge,

            business

          );




        await saveConversation(

          customer_id,

          message,

          reply

        );

        // Everything below here is a best-effort side effect (activity
        // log, auto-detecting a lead, remembering the customer's name).
        // The real reply is already generated and saved above - a
        // hiccup in any of these (e.g. the lead-classification AI call
        // failing) must never make a successful, already-saved reply
        // come back to the customer looking like it failed.
        try {

        await createActivity(

  customer_id,

  "message",

  message

);


await createActivity(

  customer_id,

  "ai_response",

  reply

);

if (

  message.toLowerCase().includes("need") ||

  message.toLowerCase().includes("repair") ||

  message.toLowerCase().includes("estimate") ||

  message.toLowerCase().includes("price")

) {


  await createLead(

    customer_id,

    business_id,

    message

  );

await createTask(

  customer_id,

  business_id,

  "Follow up with customer",

  "Customer showed buying intent: " + message,

  new Date().toISOString()

);

}

        if (

          message
          .toLowerCase()
          .includes("my name is")

        ) {


          await createMemory(

            customer_id,

            message

          );


        }

        } catch (sideEffectError) {

          console.error(

            "Chat side-effect failed (activity/lead/memory):",

            sideEffectError

          );

        }



        res.json({

          reply,

          memories_used: memories

        });

        } catch (aiError) {

          console.error(aiError);

          res.status(500).json({

            error: "AI response failed"

          });

        }



      }

    );

      }

    );



  } catch(error) {


    console.error(error);


    res.status(500).json({

      error:
      "AI response failed"

    });


  }


};



module.exports = {

  chatResponse,

};