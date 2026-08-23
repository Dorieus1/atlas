const db = require("../../database/db");


const {
  generateFollowUp
} = require("../services/followUpService");



const createFollowUp = async (req,res)=>{


  const {

    customer_id,

    summary

  } = req.body;




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

        return res.status(500).json({

          error: err.message

        });

      }



      if(!customer){

        return res.status(404).json({

          error: "Customer not found"

        });

      }



      const message =

        await generateFollowUp(

          customer,

          summary

        );



      res.json({

        message

      });



    }


  );


};



module.exports = {

  createFollowUp

};