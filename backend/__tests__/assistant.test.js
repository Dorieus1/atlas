const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");


describe("Ask Atlas", () => {

  beforeEach(() => {
    global.__mockOpenAICreate.mockClear();
    global.__mockOpenAICreate.mockResolvedValue({ output_text: "You have 2 customers and no outstanding invoices right now." });
  });


  test("answers a question using the business's own data", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AskAtlasFlow");

    await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Snapshot Customer" });

    const res = await request(app)
      .post("/api/assistant/ask")
      .set("Authorization", authHeader)
      .send({ question: "How many customers do I have?" });

    expect(res.status).toBe(200);
    expect(res.body.answer).toContain("customers");

    // The snapshot fed to the model should reflect the real, current
    // count - not a hardcoded or stale number.
    const promptSent = global.__mockOpenAICreate.mock.calls[0][0].input;
    expect(promptSent).toContain("\"customers\":1");
    expect(promptSent).toContain("How many customers do I have?");

  });


  test("a blank question is rejected before calling the model", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AskAtlasBlank");

    const res = await request(app)
      .post("/api/assistant/ask")
      .set("Authorization", authHeader)
      .send({ question: "   " });

    expect(res.status).toBe(400);
    expect(global.__mockOpenAICreate).not.toHaveBeenCalled();

  });


  test("an overly long question is rejected before calling the model", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AskAtlasTooLong");

    const res = await request(app)
      .post("/api/assistant/ask")
      .set("Authorization", authHeader)
      .send({ question: "a".repeat(501) });

    expect(res.status).toBe(400);
    expect(global.__mockOpenAICreate).not.toHaveBeenCalled();

  });


  test("requires authentication", async () => {

    const res = await request(app)
      .post("/api/assistant/ask")
      .send({ question: "How am I doing?" });

    expect(res.status).toBe(401);

  });


  test("the snapshot never mixes data across businesses", async () => {

    const bizA = await createBusinessAndUser(app, "AskAtlasTenantA");
    const bizB = await createBusinessAndUser(app, "AskAtlasTenantB");

    await request(app)
      .post("/api/customers")
      .set("Authorization", bizA.authHeader)
      .send({ name: "A Customer 1" });

    await request(app)
      .post("/api/customers")
      .set("Authorization", bizA.authHeader)
      .send({ name: "A Customer 2" });

    await request(app)
      .post("/api/customers")
      .set("Authorization", bizB.authHeader)
      .send({ name: "B Customer" });

    await request(app)
      .post("/api/assistant/ask")
      .set("Authorization", bizB.authHeader)
      .send({ question: "How many customers do I have?" });

    const promptSent = global.__mockOpenAICreate.mock.calls[0][0].input;
    expect(promptSent).toContain("\"customers\":1");

  });

});
