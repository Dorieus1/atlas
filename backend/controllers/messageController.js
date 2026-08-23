const {
  generateCustomerMessage
} = require("../services/messageService");


const generateMessage = async (req,res)=>{


  try {


    const {

      customer,

      interest,

      type

    } = req.body;



    if(!customer || !interest || !type){

      return res.status(400).json({

        error:
        "customer, interest, and type required"

      });

    }



    const message =
      await generateCustomerMessage(

        customer,

        interest,

        type

      );



    res.json({

      message

    });



  } catch(error){


    console.error(error);


    res.status(500).json({

      error:
      "Message generation failed"

    });


  }


};



module.exports = {

  generateMessage

};