const { generateAIResponse, detectKnowledgeGap, classifyLead } = require("./aiService");
const { buildChatTools } = require("./chatTools");
const { getCustomerMemories } = require("./memoryService");
const { saveConversation } = require("./conversationService");
const { getBusinessKnowledge } = require("./knowledgeService");
const { createMemory } = require("./memoryCreationService");
const { createActivity } = require("./activityService");
const { createLead, hasOpenLead } = require("./leadService");
const { createTask } = require("./taskService");
const { createNotification } = require("./notificationService");
const { createKnowledgeGap } = require("./knowledgeGapService");


// Lead detection and knowledge-gap detection are fired off without being
// awaited (see below), so the chat reply never waits on them. That makes
// them invisible to a caller that wants to know when they've finished -
// which tests do, so they can assert on a lead or a gap without polling
// on a timeout. Every detached job is registered here while it runs;
// flushBackgroundWork() waits for whatever is currently outstanding.
const backgroundWork = new Set();

const trackBackgroundWork = (promise) => {

  backgroundWork.add(promise);

  promise.finally(() => backgroundWork.delete(promise));

  return promise;

};

const flushBackgroundWork = async () => {

  while (backgroundWork.size > 0) {

    await Promise.allSettled([...backgroundWork]);

  }

};


// Shared by the authenticated chat endpoint and the public chat page -
// both routes resolve their own customer/business first (with their own
// ownership/scoping rules), then hand off here for the actual AI reply
// and its side effects, so that pipeline only exists in one place.
const processChatMessage = async (customer, business, message) => {

  const customer_id = customer.id;
  const business_id = business.id;

  const memories = await getCustomerMemories(customer_id);

  const knowledge = await getBusinessKnowledge(business_id);

  // Gives the AI a real check_availability/book_appointment ability when
  // (and only when) the business has real hours configured - see
  // chatTools.js and generateAIResponse's own comments for the full
  // reasoning and the safeguards that keep this scoped to the current
  // customer's own, still-owner-reviewable requests.
  const tools = buildChatTools(business, customer);

  const reply = await generateAIResponse(

    message,

    memories,

    knowledge,

    business,

    tools

  );

  await saveConversation(

    customer_id,

    message,

    reply

  );

  // Everything below here is a best-effort side effect (activity log,
  // remembering the customer's name). The real reply is already
  // generated and saved above - a hiccup in either of these must never
  // make a successful, already-saved reply come back to the customer
  // looking like it failed. Both are plain DB writes with no AI call
  // involved, so there's no latency reason to detach them the way lead
  // detection and knowledge-gap detection are below.
  try {

    await createActivity(customer_id, "message", message);

    await createActivity(customer_id, "ai_response", reply);

    if (message.toLowerCase().includes("my name is")) {

      await createMemory(customer_id, message);

    }

  } catch (sideEffectError) {

    console.error(

      "Chat side-effect failed (activity/memory):",

      sideEffectError

    );

  }

  // Detached the same way knowledge-gap detection already is, and for
  // the same reason - classifyLead is a real OpenAI round-trip, and
  // this used to run INLINE gated by a crude keyword check ("need",
  // "repair", "estimate", "price"), which was wrong in both directions:
  // it missed genuine buying intent that just doesn't happen to use one
  // of those exact words ("How much would this cost?"), and whenever it
  // DID match, the customer silently waited through a second full
  // OpenAI call (on top of the reply itself) before ever seeing their
  // answer. Using the real classification as the gate instead fixes the
  // accuracy problem; detaching it fixes the latency one for free.
  trackBackgroundWork(

    runLeadDetection(customer, business_id, message).catch(

      (leadError) => console.error("LEAD DETECTION FAILED:", leadError)

    )

  );

  // Knowledge-gap detection is a second, full OpenAI round-trip - the
  // slowest thing in this whole pipeline. It's fired off without
  // awaiting (own try/catch, own error path) so it can never delay the
  // reply the customer is actually waiting on; the reply above is
  // already generated and saved either way, and this only ever adds a
  // suggestion for the owner to review later.
  trackBackgroundWork(

    runKnowledgeGapDetection(business_id, customer_id, message, reply, knowledge).catch(

      (gapError) => console.error("KNOWLEDGE GAP DETECTION FAILED:", gapError)

    )

  );

  return { reply, memories_used: memories };

};


const runLeadDetection = async (customer, business_id, message) => {

  const priority = await classifyLead(message);

  if (priority === "cold") {
    return;
  }

  // One lead per ongoing opportunity, not one per message - without
  // this, a customer sending two follow-up messages in the same
  // conversation (e.g. answering a clarifying question) would create
  // two separate lead cards, two follow-up tasks, and two notifications
  // for what the owner experiences as a single conversation. A lead the
  // owner has already closed is a genuinely new opportunity if the
  // customer comes back, so only an existing OPEN lead blocks a new one -
  // checked across ALL of the customer's leads (hasOpenLead), not just
  // their most recent one, since a customer can have an older lead
  // still open and a newer one already closed.
  if (await hasOpenLead(customer.id, business_id)) {
    return;
  }

  await createLead(customer.id, business_id, message, priority);

  await createTask(

    customer.id,

    business_id,

    "Follow up with customer",

    "Customer showed buying intent: " + message,

    new Date().toISOString()

  );

  await createNotification(

    business_id,

    "hot_lead",

    `${priority === "hot" ? "🔥 New hot lead" : "New lead"}: ${customer.name || "A customer"}`,

    message.length > 140 ? message.slice(0, 140) + "…" : message,

    "/leads"

  );

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


module.exports = { processChatMessage, flushBackgroundWork };
