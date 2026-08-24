const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");

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
