const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser, sendChatMessage } = require("./setup/helpers");

const createCustomer = async (app, authHeader, name) => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name });

  return res.body.id;

};

describe("AI failures don't take down the server", () => {

  beforeEach(() => {

    global.__mockOpenAICreate.mockReset();
    global.__mockOpenAICreate.mockResolvedValue({ output_text: "hot" });

  });

  test("a chat message fails gracefully if OpenAI errors, and the server keeps serving other requests", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AIFailChat");
    const customerId = await createCustomer(app, authHeader, "AI Fail Customer");

    global.__mockOpenAICreate.mockRejectedValueOnce(new Error("Request timed out"));

    const failed = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, message: "hello" });

    expect(failed.status).toBe(500);

    const stillAlive = await request(app)
      .get("/api/customers")
      .set("Authorization", authHeader);

    expect(stillAlive.status).toBe(200);

  });

  test("a chat reply still succeeds even if the follow-on lead-classification AI call fails", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AIFailLeadClassify");
    const customerId = await createCustomer(app, authHeader, "Lead Classify Customer");

    // First call: the actual chat reply - succeeds.
    global.__mockOpenAICreate.mockResolvedValueOnce({ output_text: "Sure, I can help with that." });

    // Second call: classifyLead, run detached (runLeadDetection) right
    // after the reply above - fails. This must not make the reply above
    // look like it failed, since it already succeeded and was already
    // saved before this detached call even starts.
    global.__mockOpenAICreate.mockRejectedValueOnce(new Error("Request timed out"));

    // A real message, not the CRM's own preview box - persistence is
    // exactly what this test is checking, and the preview endpoint never
    // persists on purpose (see chatService's `preview` option).
    const res = await sendChatMessage(app, authHeader, customerId, "I need an estimate for a repair");

    expect(res.status).toBe(200);
    expect(res.body.reply).toBe("Sure, I can help with that.");

    const conversations = await request(app)
      .get(`/api/conversations/${customerId}`)
      .set("Authorization", authHeader);

    expect(conversations.body).toHaveLength(1);
    expect(conversations.body[0].response).toBe("Sure, I can help with that.");

  });

  test("the daily briefing fails gracefully if OpenAI errors", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AIFailBriefing");

    global.__mockOpenAICreate.mockRejectedValueOnce(new Error("Request timed out"));

    const res = await request(app)
      .get("/api/briefing")
      .set("Authorization", authHeader);

    expect(res.status).toBe(500);

    const stillAlive = await request(app)
      .get("/api/customers")
      .set("Authorization", authHeader);

    expect(stillAlive.status).toBe(200);

  });

  test("the customer AI summary fails gracefully if OpenAI errors", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AIFailSummary");
    const customerId = await createCustomer(app, authHeader, "Summary Customer");

    global.__mockOpenAICreate.mockRejectedValueOnce(new Error("Request timed out"));

    const res = await request(app)
      .get(`/api/customer-summary/${customerId}`)
      .set("Authorization", authHeader);

    expect(res.status).toBe(500);

    const stillAlive = await request(app)
      .get("/api/customers")
      .set("Authorization", authHeader);

    expect(stillAlive.status).toBe(200);

  });

  test("generating a follow-up message fails gracefully if OpenAI errors", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AIFailFollowUp");
    const customerId = await createCustomer(app, authHeader, "Follow Up Customer");

    global.__mockOpenAICreate.mockRejectedValueOnce(new Error("Request timed out"));

    const res = await request(app)
      .post("/api/follow-up")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, summary: "wants an estimate" });

    expect(res.status).toBe(500);

    const stillAlive = await request(app)
      .get("/api/customers")
      .set("Authorization", authHeader);

    expect(stillAlive.status).toBe(200);

  });

});
