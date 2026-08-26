const request = require("supertest");
const { v4: uuidv4 } = require("uuid");
const app = require("../server");
const db = require("../../database/db");
const { createBusinessAndUser } = require("./setup/helpers");
const { sendWinBackCampaign } = require("../services/winBackService");


const runAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });
  });

};


const daysAgoIso = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();


const insertOldAppointment = (business_id, customer_id) => {

  return runAsync(

    `
    INSERT INTO appointments (id, business_id, customer_id, title, start_time, status)
    VALUES (?, ?, ?, ?, ?, 'completed')
    `,

    [uuidv4(), business_id, customer_id, "Old job", daysAgoIso(120)]

  );

};


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

    // Job costing's numbers should be part of the snapshot too, not just
    // raw revenue - the whole point of this feature is to give real
    // profitability answers, not just top-line revenue ones.
    expect(promptSent).toContain("\"jobCostsOnPaidInvoices\":0");
    expect(promptSent).toContain("\"profitMargin\":0");

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


  test("a dormant customer still counts as dormant right after the win-back job has already drafted a message for them - the count shouldn't drop just because the cooldown started", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "AskAtlasDormantCooldown");

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Long Gone Customer" });

    await insertOldAppointment(business_id, customerRes.body.id);

    // Run the actual win-back job first - this stamps last_win_back_at
    // on the customer, which is exactly the condition that used to make
    // them silently vanish from Ask Atlas's dormant count for 90 days.
    global.__mockOpenAICreate.mockResolvedValueOnce({ output_text: "Draft message" });
    await sendWinBackCampaign();

    await request(app)
      .post("/api/assistant/ask")
      .set("Authorization", authHeader)
      .send({ question: "How many dormant customers do I have?" });

    const promptSent = global.__mockOpenAICreate.mock.calls[
      global.__mockOpenAICreate.mock.calls.length - 1
    ][0].input;

    expect(promptSent).toContain("\"dormantCustomers\":1");

  });

});
