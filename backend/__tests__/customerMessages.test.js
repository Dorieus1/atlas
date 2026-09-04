const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");


const createCustomer = async (authHeader, name, email) => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name, email });

  return res.body.id;

};


// Mirrors dailyDigest.test.js's own helper - Resend's actual HTTP call
// is globally mocked (see setup/mockEmail.js), so this reads back what
// was actually sent rather than trusting a real inbox.
const lastSentEmail = () => {

  const calls = global.fetch.mock.calls;
  return JSON.parse(calls[calls.length - 1][1].body);

};


describe("Sending a real message to a customer", () => {

  beforeEach(() => {
    global.fetch.mockClear();
  });


  test("sends a real email through Resend and records it for the timeline", async () => {

    const { authHeader } = await createBusinessAndUser(app, "MessageCustomer");
    const customerId = await createCustomer(authHeader, "Jamie Customer", "jamie@test.com");

    const res = await request(app)
      .post(`/api/customers/${customerId}/messages`)
      .set("Authorization", authHeader)
      .send({ subject: "About your upcoming visit", body: "Hi Jamie,\n\nJust confirming we're still on for Tuesday." });

    expect(res.status).toBe(201);
    expect(res.body.sentTo).toBe("jamie@test.com");

    const sent = lastSentEmail();
    expect(sent.to).toEqual(["jamie@test.com"]);
    expect(sent.subject).toBe("About your upcoming visit");
    // escapeHtml (see emailService.js) correctly turns the apostrophe
    // into &#39; - this is the customer's own real email inbox, so the
    // body must be HTML-safe, not just readable in a test assertion.
    expect(sent.html).toContain("Just confirming we&#39;re still on for Tuesday.");

    const timeline = await request(app)
      .get(`/api/customers/${customerId}/timeline`)
      .set("Authorization", authHeader);

    const messageEvent = timeline.body.find((event) => event.type === "owner_message");

    expect(messageEvent).toBeTruthy();
    expect(messageEvent.subject).toBe("About your upcoming visit");
    expect(messageEvent.body).toContain("Just confirming we're still on for Tuesday.");
    expect(messageEvent.sentByName).toBeTruthy();

  });


  test("a customer with no email on file can't be messaged this way", async () => {

    const { authHeader } = await createBusinessAndUser(app, "MessageNoEmail");
    const customerId = await createCustomer(authHeader, "No Email Customer", "");

    const res = await request(app)
      .post(`/api/customers/${customerId}/messages`)
      .set("Authorization", authHeader)
      .send({ subject: "Hi", body: "Hello there" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/doesn't have an email/i);
    expect(global.fetch).not.toHaveBeenCalled();

  });


  test("a missing subject or body is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "MessageMissingFields");
    const customerId = await createCustomer(authHeader, "Some Customer", "some@test.com");

    const noSubject = await request(app)
      .post(`/api/customers/${customerId}/messages`)
      .set("Authorization", authHeader)
      .send({ subject: "", body: "Hello" });

    expect(noSubject.status).toBe(400);

    const noBody = await request(app)
      .post(`/api/customers/${customerId}/messages`)
      .set("Authorization", authHeader)
      .send({ subject: "Hi", body: "" });

    expect(noBody.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();

  });


  test("a nonexistent customer returns 404", async () => {

    const { authHeader } = await createBusinessAndUser(app, "MessageNotFound");

    const res = await request(app)
      .post("/api/customers/does-not-exist/messages")
      .set("Authorization", authHeader)
      .send({ subject: "Hi", body: "Hello" });

    expect(res.status).toBe(404);

  });


  test("a business can't message another business's customer", async () => {

    const businessA = await createBusinessAndUser(app, "MessageScopeA");
    const businessB = await createBusinessAndUser(app, "MessageScopeB");

    const customerId = await createCustomer(businessA.authHeader, "A's Customer", "acustomer@test.com");

    const res = await request(app)
      .post(`/api/customers/${customerId}/messages`)
      .set("Authorization", businessB.authHeader)
      .send({ subject: "Hi", body: "Hello" });

    expect(res.status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();

  });


  test("the customer's own real chat/portal history is completely untouched by this", async () => {

    // This is the exact confusion a review flagged in the OLD "Atlas
    // Chat" panel - sending something to a customer must never be
    // confused with, or land in, the AI conversation pipeline.
    const { authHeader } = await createBusinessAndUser(app, "MessageNoConversation");
    const customerId = await createCustomer(authHeader, "Conversation Customer", "convo@test.com");

    await request(app)
      .post(`/api/customers/${customerId}/messages`)
      .set("Authorization", authHeader)
      .send({ subject: "Hi", body: "Hello there" });

    const conversation = await request(app)
      .get(`/api/conversations/${customerId}`)
      .set("Authorization", authHeader);

    expect(conversation.body).toHaveLength(0);

  });

});
