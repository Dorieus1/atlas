const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");

describe("Onboarding status", () => {

  test("a brand new business has every checklist item incomplete", async () => {

    const { authHeader } = await createBusinessAndUser(app, "OnboardFresh");

    const status = await request(app)
      .get("/api/onboarding/status")
      .set("Authorization", authHeader);

    expect(status.status).toBe(200);
    expect(status.body.has_customer).toBe(false);
    expect(status.body.has_knowledge).toBe(false);
    expect(status.body.has_review_link).toBe(false);
    expect(status.body.has_conversation).toBe(false);
    expect(status.body.dismissed).toBe(false);

  });

  test("each checklist item flips true independently as the real underlying data appears", async () => {

    const { authHeader } = await createBusinessAndUser(app, "OnboardProgress");

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Checklist Customer" });

    const afterCustomer = await request(app)
      .get("/api/onboarding/status")
      .set("Authorization", authHeader);

    expect(afterCustomer.body.has_customer).toBe(true);
    expect(afterCustomer.body.has_knowledge).toBe(false);

    await request(app)
      .post("/api/knowledge")
      .set("Authorization", authHeader)
      .send({ title: "Hours", content: "We're open 9-5" });

    const afterKnowledge = await request(app)
      .get("/api/onboarding/status")
      .set("Authorization", authHeader);

    expect(afterKnowledge.body.has_knowledge).toBe(true);
    expect(afterKnowledge.body.has_review_link).toBe(false);

    await request(app)
      .put("/api/business")
      .set("Authorization", authHeader)
      .send({ name: "Whatever", review_link: "https://g.page/r/example/review" });

    const afterReviewLink = await request(app)
      .get("/api/onboarding/status")
      .set("Authorization", authHeader);

    expect(afterReviewLink.body.has_review_link).toBe(true);
    expect(afterReviewLink.body.has_conversation).toBe(false);

    await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerRes.body.id, message: "Just saying hi" });

    const afterConversation = await request(app)
      .get("/api/onboarding/status")
      .set("Authorization", authHeader);

    expect(afterConversation.body.has_conversation).toBe(true);

  });

  test("dismissing the checklist persists, and is scoped to the right business", async () => {

    const bizA = await createBusinessAndUser(app, "OnboardDismissA");
    const bizB = await createBusinessAndUser(app, "OnboardDismissB");

    const dismiss = await request(app)
      .patch("/api/onboarding/dismiss")
      .set("Authorization", bizA.authHeader);

    expect(dismiss.status).toBe(200);

    const aStatus = await request(app)
      .get("/api/onboarding/status")
      .set("Authorization", bizA.authHeader);

    expect(aStatus.body.dismissed).toBe(true);

    const bStatus = await request(app)
      .get("/api/onboarding/status")
      .set("Authorization", bizB.authHeader);

    expect(bStatus.body.dismissed).toBe(false);

  });

});
