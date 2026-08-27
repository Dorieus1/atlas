const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");

describe("AI-drafted follow-up message (Leads pipeline)", () => {

  beforeEach(() => {
    global.__mockOpenAICreate.mockClear();
    global.__mockOpenAICreate.mockResolvedValue({ output_text: "Hi there, just following up on your request!" });
  });

  test("drafts a message and grounds the AI in the business's real knowledge base and profile", async () => {

    const { authHeader } = await createBusinessAndUser(app, "FollowUpGrounded");

    await request(app)
      .post("/api/knowledge")
      .set("Authorization", authHeader)
      .send({ title: "Service Call Pricing", content: "$89 flat fee for any diagnostic visit." });

    const res = await request(app)
      .post("/api/follow-up-message")
      .set("Authorization", authHeader)
      .send({ customer: "Jane Doe", interest: "Furnace is making a noise, asked about hours and pricing" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Hi there, just following up on your request!");

    // Regression check for a real bug found during live testing: this
    // route used to call the AI with an empty knowledge array and a
    // null business, so it had no real pricing to work from and could
    // invent a price. The actual $89 entry must now reach the model -
    // business knowledge goes into `instructions` (aiService.js's own
    // instructions/input split), the task prompt itself into `input`.
    const callArgs = global.__mockOpenAICreate.mock.calls[0][0];

    expect(callArgs.instructions).toContain("$89 flat fee for any diagnostic visit");

    // The anti-invention rule itself now lives once, in aiService.js's
    // shared instructions (every generateAIResponse caller gets it),
    // not repeated per-caller in this route's own prompt.
    expect(callArgs.instructions).toContain("Never estimate, round, average, extrapolate, or invent");

  });


  test("missing customer or interest is rejected before calling the AI", async () => {

    const { authHeader } = await createBusinessAndUser(app, "FollowUpMissing");

    const res = await request(app)
      .post("/api/follow-up-message")
      .set("Authorization", authHeader)
      .send({ customer: "Jane Doe" });

    expect(res.status).toBe(400);
    expect(global.__mockOpenAICreate).not.toHaveBeenCalled();

  });


  test("is scoped to the right business's own knowledge base", async () => {

    const bizA = await createBusinessAndUser(app, "FollowUpIsoA");
    const bizB = await createBusinessAndUser(app, "FollowUpIsoB");

    await request(app)
      .post("/api/knowledge")
      .set("Authorization", bizA.authHeader)
      .send({ title: "Pricing", content: "$999 for business A only" });

    await request(app)
      .post("/api/follow-up-message")
      .set("Authorization", bizB.authHeader)
      .send({ customer: "Someone", interest: "Wants a quote" });

    const callArgs = global.__mockOpenAICreate.mock.calls[0][0];

    expect(callArgs.instructions).not.toContain("$999");

  });

});
