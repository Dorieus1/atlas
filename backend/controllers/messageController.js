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

    // Only ever "SMS" or "Email" from the real UI (see
    // IntelligencePanel.jsx) - `type` gets interpolated directly into
    // the AI prompt's instructions ("Create a customer ${type}."), so
    // it's validated against a fixed allowlist here rather than trusted
    // as free text from the request body.
    if (type !== "SMS" && type !== "Email") {

      return res.status(400).json({

        error:
        "type must be \"SMS\" or \"Email\""

      });

    }

    if (customer.length > 500 || interest.length > 2000) {

      return res.status(400).json({

        error:
        "customer or interest is too long"

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