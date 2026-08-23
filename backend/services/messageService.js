const OpenAI = require("openai");

const client = new OpenAI({

  apiKey: process.env.OPENAI_API_KEY,

});


const generateCustomerMessage = async (

  customer,

  interest,

  type

) => {


  const prompt = `

You are Atlas AI, a professional business assistant.

Create a customer ${type}.

Customer name:
${customer}

Customer request:
${interest}


Rules:

- Be professional
- Be concise
- Encourage a response
- Do not sound robotic


Return only the message.

`;



  const response = await client.responses.create({

    model: "gpt-5-mini",

    input: prompt

  });



  return response.output_text;


};



module.exports = {

  generateCustomerMessage

};