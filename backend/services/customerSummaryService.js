const OpenAI = require("openai");


const client = new OpenAI({

  apiKey: process.env.OPENAI_API_KEY,

});



// Only human-relevant fields go into the prompt - raw rows carry
// internal ids, foreign keys, and ISO timestamps that the model will
// otherwise happily quote straight back in its summary (e.g. "Customer
// record: id 46baaa02-..., created_at 2026-08-24 18:09:27"), which
// reads like a leaked database dump to the business owner, not a
// written summary. A short, human-friendly date is kept where it's
// actually useful context; the raw id/foreign-key columns are dropped
// entirely.
function formatDate(value) {

  return value ? new Date(value).toLocaleDateString() : null;

}

const generateCustomerSummary = async (

  customer,

  conversations,

  notes,

  activities

) => {

  const customerForPrompt = {
    name: customer?.name,
    email: customer?.email,
    phone: customer?.phone
  };

  const conversationsForPrompt = (conversations || []).map((c) => ({
    date: formatDate(c.created_at),
    message: c.message,
    response: c.response
  }));

  const notesForPrompt = (notes || []).map((n) => ({
    date: formatDate(n.created_at),
    note: n.note
  }));

  const activitiesForPrompt = (activities || []).map((a) => ({
    date: formatDate(a.created_at),
    type: a.type,
    content: a.content
  }));

  const prompt = `

You are Atlas AI, a business assistant.

Create a short customer summary using ONLY the real data provided
below. Do not invent, assume, or add conversations, notes,
activity, deal values, or details that are not present in the data.
If CONVERSATIONS, NOTES, or ACTIVITY are empty, say plainly that
there is no history yet -- do not make any up.

Write in plain, professional prose for a business owner - never
mention database fields, ids, or technical terms, and never include
any identifier-looking value even if one appears in the data below.

Include:

- Customer intent
- Important details
- Recommended next action


CUSTOMER:

${JSON.stringify(customerForPrompt)}


CONVERSATIONS:

${JSON.stringify(conversationsForPrompt)}


NOTES:

${JSON.stringify(notesForPrompt)}


ACTIVITY:

${JSON.stringify(activitiesForPrompt)}



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