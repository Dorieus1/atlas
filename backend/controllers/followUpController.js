const db = require("../../database/db");


const {
  generateFollowUp
} = require("../services/followUpService");



const createFollowUp = async (req,res)=>{


  const {

    customer_id,

    summary

  } = req.body;



  if (!customer_id || !summary || !summary.trim()) {

    return res.status(400).json({

      error: "customer_id and summary are required"

    });

  }

  if (summary.length > 4000) {

    return res.status(400).json({

      error: "Summary is too long"

    });

  }


  db.get(

    `
    SELECT *
    FROM customers
    WHERE id = ?
    AND business_id = ?
    `,

    [customer_id, req.user.business_id],


    async (err, customer)=>{


      if(err){

        console.error(err);

        return res.status(500).json({

          error: "Something went wrong. Please try again."

        });

      }



      if(!customer){

        return res.status(404).json({

          error: "Customer not found"

        });

      }



      try {

        const message =

          await generateFollowUp(

            customer,

            summary

          );



        res.json({

          message

        });

      } catch (aiError) {

        console.error(aiError);

        res.status(500).json({

          error: "Failed to generate follow-up message"

        });

      }



    }


  );


};



module.exports = {

  createFollowUp

};