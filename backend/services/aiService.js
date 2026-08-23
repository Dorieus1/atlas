const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const generateAIResponse = async (
  message,
  memories = [],
  knowledge = [],
  business = null
) => {

  const memoryText = memories.length
    ? memories.map(item => item.memory).join("\n")
    : "No customer information available.";

  const knowledgeText = knowledge.length
    ? knowledge
        .map(item => `${item.title}: ${item.content}`)
        .join("\n")
    : "No additional business information available.";

  const businessText = business
    ? `
Business Name:
${business.name}

Industry:
${business.industry}

Phone:
${business.phone}

Email:
${business.email}

Address:
${business.address}

Services:
${business.services}
`
    : "No business profile available.";

  const prompt = `
You are Atlas AI, a professional AI receptionist.

BUSINESS PROFILE:
${businessText}

BUSINESS KNOWLEDGE:
${knowledgeText}

CUSTOMER MEMORY:
${memoryText}

CUSTOMER MESSAGE:
${message}

Respond professionally.
`;

  const response = await client.responses.create({
    model: "gpt-5-mini",
    input: prompt,
  });

  return response.output_text;
};

const classifyLead = async (message) => {

  const prompt = `
You are a sales qualification AI.

Classify this customer inquiry as exactly one of:

hot
warm
cold

Rules:

HOT:
- Wants to buy
- Requests pricing
- Requests an estimate
- Wants service soon
- Has urgency

WARM:
- Interested
- Comparing options
- Wants information

COLD:
- General questions
- No buying intent

Customer message:
${message}

Respond with ONLY one word:

hot
warm
cold
`;

  const response = await client.responses.create({
    model: "gpt-5-mini",
    input: prompt,
  });

  return response.output_text.trim().toLowerCase();
};

module.exports = {
  generateAIResponse,
  classifyLead,
};