const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");

// Regression tests for a gap a peer review caught right after the
// closed-day-hours/invented-pricing bug was fixed in aiService.js and
// followUpMessage.js: two OTHER real, active AI-drafting paths had
// either no anti-invention language at all (messageService.js, used by
// the "Generate Message" SMS/Email feature) or only the same narrow
// "don't invent prices" framing that had already been proven
// insufficient (followUpService.js, used by the Customer Profile
// follow-up feature, the win-back campaign, and lead-detected
// follow-ups). Neither of these receives real business/knowledge data
// to ground a draft in, so the only real check available here is that
// the instruction itself is present in what's sent to the model.
describe("AI-drafted customer messages refuse to invent facts", () => {

  beforeEach(() => {
    global.__mockOpenAICreate.mockClear();
    global.__mockOpenAICreate.mockResolvedValue({ output_text: "Draft message" });
  });

  test("the 'Generate Message' (SMS/Email) draft is told not to invent a price or other specific detail", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AntiInventionMessage");

    const res = await request(app)
      .post("/api/messages")
      .set("Authorization", authHeader)
      .send({ customer: "Jamie Rivera", interest: "Wants pricing for a new roof", type: "SMS" });

    expect(res.status).toBe(200);

    const callArgs = global.__mockOpenAICreate.mock.calls[0][0];

    expect(callArgs.instructions).toContain("Never invent, estimate, guess, or add a specific price");

  });

  test("the Customer Profile follow-up draft is told not to invent a fact or an exception", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AntiInventionFollowUp");

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Follow Up Customer" });

    const res = await request(app)
      .post("/api/follow-up")
      .set("Authorization", authHeader)
      .send({ customer_id: customerRes.body.id, summary: "Asked about pricing for a roof repair" });

    expect(res.status).toBe(200);

    const callArgs = global.__mockOpenAICreate.mock.calls[0][0];

    expect(callArgs.instructions).toContain("Never invent, estimate, or assume a specific price");
    expect(callArgs.instructions).toContain("including inventing an exception or special case");

  });

});
