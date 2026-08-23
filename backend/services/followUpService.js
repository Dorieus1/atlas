const OpenAI = require("openai");


const client = new OpenAI({

  apiKey: process.env.OPENAI_API_KEY,

});




const generateFollowUp = async (

  customer,

  summary

) => {


  const prompt = `

You are Atlas AI, a professional sales assistant.

Create a short follow-up message for a business employee to send to a customer.


CUSTOMER:

${JSON.stringify(customer)}



CUSTOMER SUMMARY:

${summary}



Requirements:

- Professional tone
- Friendly
- Short
- Encourage response
- Do not invent prices


Write only the message.

`;



  const response = await client.responses.create({

    model: "gpt-5-mini",

    input: prompt

  });



  return response.output_text;


};



module.exports = {

  generateFollowUp

};