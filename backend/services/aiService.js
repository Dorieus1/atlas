const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


const generateAIResponse = async (
  message,
  memories = [],
  knowledge = []
) => {

  const memoryText = memories.length
  ? memories.map(item => item.memory).join("\n")
  : "No previous customer information.";


const knowledgeText = knowledge.length
  ? knowledge.map(item => `${item.title}: ${item.content}`).join("\n")
  : "No business information available.";


  const prompt = `
You are Atlas AI, a business assistant.

Customer information:
${memoryText}

Business information:
${knowledgeText}

Customer message:
${message}

Respond professionally and helpfully.
`;


  const response = await client.responses.create({
    model: "gpt-5-mini",
    input: prompt,
  });


  return response.output_text;

};


module.exports = {
  generateAIResponse,
};