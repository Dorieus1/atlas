const OpenAI = require("openai");


const client = new OpenAI({

  apiKey: process.env.OPENAI_API_KEY,

});



const generateCustomerSummary = async (

  customer,

  conversations,

  notes,

  activities

) => {


  const prompt = `

You are Atlas AI, a business assistant.

Create a short customer summary using ONLY the real data provided
below. Do not invent, assume, or add conversations, notes,
activity, deal values, or details that are not present in the data.
If CONVERSATIONS, NOTES, or ACTIVITY are empty, say plainly that
there is no history yet -- do not make any up.

Include:

- Customer intent
- Important details
- Recommended next action


CUSTOMER:

${JSON.stringify(customer)}


CONVERSATIONS:

${JSON.stringify(conversations)}


NOTES:

${JSON.stringify(notes)}


ACTIVITY:

${JSON.stringify(activities)}



Write a professional summary based strictly on the data above.

`;



  const response = await client.responses.create({

    model: "gpt-5-mini",

    input: prompt

  });



  return response.output_text;


};



module.exports = {

  generateCustomerSummary

};