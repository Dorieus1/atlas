const { generateAIResponse, detectKnowledgeGap } = require("./aiService");
const { getCustomerMemories } = require("./memoryService");
const { saveConversation } = require("./conversationService");
const { getBusinessKnowledge } = require("./knowledgeService");
const { createMemory } = require("./memoryCreationService");
const { createActivity } = require("./activityService");
const { createLead } = require("./leadService");
const { createTask } = require("./taskService");
const { createNotification } = require("./notificationService");
const { createKnowledgeGap } = require("./knowledgeGapService");


// Shared by the authenticated chat endpoint and the public chat page -
// both routes resolve their own customer/business first (with their own
// ownership/scoping rules), then hand off here for the actual AI reply
// and its side effects, so that pipeline only exists in one place.
const processChatMessage = async (customer, business, message) => {

  const customer_id = customer.id;
  const business_id = business.id;

  const memories = await getCustomerMemories(customer_id);

  const knowledge = await getBusinessKnowledge(business_id);

  const reply = await generateAIResponse(

    message,

    memories,

    knowledge,

    business

  );

  await saveConversation(

    customer_id,

    message,

    reply

  );

  // Everything below here is a best-effort side effect (activity log,
  // auto-detecting a lead, remembering the customer's name). The real
  // reply is already generated and saved above - a hiccup in any of
  // these (e.g. the lead-classification AI call failing) must never
  // make a successful, already-saved reply come back to the customer
  // looking like it failed.
  try {

    await createActivity(customer_id, "message", message);

    await createActivity(customer_id, "ai_response", reply);

    if (

      message.toLowerCase().includes("need") ||
      message.toLowerCase().includes("repair") ||
      message.toLowerCase().includes("estimate") ||
      message.toLowerCase().includes("price")

    ) {

      await createLead(customer_id, business_id, message);

      await createTask(

        customer_id,

        business_id,

        "Follow up with customer",

        "Customer showed buying intent: " + message,

        new Date().toISOString()

      );

      await createNotification(

        business_id,

        "hot_lead",

        `🔥 New hot lead: ${customer.name || "A customer"}`,

        message.length > 140 ? message.slice(0, 140) + "…" : message,

        "/leads"

      );

    }

    if (message.toLowerCase().includes("my name is")) {

      await createMemory(customer_id, message);

    }

  } catch (sideEffectError) {

    console.error(

      "Chat side-effect failed (activity/lead/memory):",

      sideEffectError

    );

  }

  // Knowledge-gap detection is a second, full OpenAI round-trip - the
  // slowest thing in this whole pipeline. It's fired off without
  // awaiting (own try/catch, own error path) so it can never delay the
  // reply the customer is actually waiting on; the reply above is
  // already generated and saved either way, and this only ever adds a
  // suggestion for the owner to review later.
  runKnowledgeGapDetection(business_id, customer_id, message, reply, knowledge).catch(

    (gapError) => console.error("KNOWLEDGE GAP DETECTION FAILED:", gapError)

  );

  return { reply, memories_used: memories };

};


const runKnowledgeGapDetection = async (business_id, customer_id, message, reply, knowledge) => {

  const gap = await detectKnowledgeGap(message, reply, knowledge);

  if (gap.hasGap && gap.suggestedTitle && gap.suggestedContent) {

    await createKnowledgeGap(

      business_id,
      customer_id,
      message,
      gap.suggestedTitle,
      gap.suggestedContent

    );

    await createNotification(

      business_id,

      "knowledge_gap",

      `🧠 Atlas wasn't sure how to answer a question`,

      gap.suggestedTitle,

      "/knowledge"

    );

  }

};


module.exports = { processChatMessage };
