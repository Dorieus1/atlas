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

// Models sometimes wrap requested JSON in a markdown code fence despite
// being told not to - strip that before parsing rather than failing the
// whole draft over a formatting quirk.
function parseEstimateJson(text) {

  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");

  const parsed = JSON.parse(cleaned);

  const items = Array.isArray(parsed.items)
    ? parsed.items.map((item) => ({
        description: String(item.description || "").slice(0, 300),
        quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
        unit_price: Number(item.unit_price) >= 0 ? Number(item.unit_price) : 0
      }))
    : [];

  return {
    items,
    summary: String(parsed.summary || "")
  };

}


// Drafts a starting-point line-item estimate from a photo of a job/
// damage - explicitly framed to the model (and to the owner, via the
// summary) as a draft to review and adjust, never a final number to
// hand a customer untouched. imageDataUrl must be a data: URL (base64),
// not a bare file path - the model has no access to this server's disk.
const generateEstimateFromPhoto = async (imageDataUrl, business, caption) => {

  const industry = business?.industry || "home/field service";

  const promptText = `
You are an experienced estimator for a ${industry} business${business?.name ? ` called ${business.name}` : ""}.
${business?.services ? `Services this business offers: ${business.services}.` : ""}

Look at the attached photo${caption ? ` (captioned: "${caption}")` : ""} and draft a rough, reasonable line-item estimate for the work shown - the materials and labor a professional would likely need to charge for. This is a STARTING DRAFT for the business owner to review and adjust before sending to a customer, not a final quote - use realistic but conservative pricing for typical US labor/material rates.

Respond with ONLY valid JSON in exactly this shape, no markdown, no extra text:
{
  "items": [
    { "description": "...", "quantity": 1, "unit_price": 0 }
  ],
  "summary": "one or two sentences on what you saw and why you estimated it this way"
}

If the photo doesn't show anything you can reasonably estimate work for, return {"items": [], "summary": "explain why"}.
`;

  const response = await client.responses.create({

    model: "gpt-5-mini",

    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: promptText },
          { type: "input_image", image_url: imageDataUrl }
        ]
      }
    ]

  });

  return parseEstimateJson(response.output_text);

};


function parseGapJson(text) {

  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");

  const parsed = JSON.parse(cleaned);

  return {
    hasGap: !!parsed.has_gap,
    suggestedTitle: String(parsed.suggested_title || "").slice(0, 200),
    suggestedContent: String(parsed.suggested_content || "").slice(0, 2000)
  };

}


// A second, best-effort pass over a reply that's already been generated
// and sent - never blocks or delays the customer-facing chat, only
// flags when the AI likely had to guess or hedge because the business
// hasn't given it enough specific knowledge, and drafts a starting-
// point knowledge entry so the owner can close that gap for next time.
const detectKnowledgeGap = async (message, reply, knowledge = []) => {

  const knowledgeText = knowledge.length
    ? knowledge.map((item) => `${item.title}: ${item.content}`).join("\n")
    : "No business knowledge has been added yet.";

  const prompt = `
You are reviewing an AI receptionist's reply to a customer, looking for cases where it had to guess or answer vaguely because the business hasn't given it enough specific information.

EXISTING BUSINESS KNOWLEDGE:
${knowledgeText}

CUSTOMER MESSAGE:
${message}

AI REPLY:
${reply}

Did the AI have to guess, hedge, or give a generic answer because it lacked specific business knowledge to answer confidently? Ignore small talk, greetings, and anything the existing knowledge already answers well.

Respond with ONLY valid JSON in exactly this shape, no markdown, no extra text:
{
  "has_gap": true or false,
  "suggested_title": "short title for a new knowledge entry (only meaningful if has_gap is true)",
  "suggested_content": "a specific, factual answer the business owner could add (only meaningful if has_gap is true)"
}
`;

  const response = await client.responses.create({
    model: "gpt-5-mini",
    input: prompt,
  });

  return parseGapJson(response.output_text);

};


module.exports = {
  generateAIResponse,
  classifyLead,
  generateEstimateFromPhoto,
  detectKnowledgeGap,
};