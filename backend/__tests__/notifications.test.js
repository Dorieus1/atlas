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


// Lead detection (classifyLead) now runs detached from the chat response
// (see chatService.js's runLeadDetection) so it can never delay the
// reply the customer is actually waiting on - which means the resulting
// notification doesn't necessarily exist yet the instant POST /api/chat
// returns. Polls briefly rather than asserting immediately, matching the
// same pattern already used for Google Calendar sync and knowledge-gap
// detection elsewhere in this test suite.
const waitFor = async (checkFn, { timeout = 1000, interval = 20 } = {}) => {

  const start = Date.now();

  while (true) {

    const result = await checkFn();

    if (result || Date.now() - start > timeout) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));

  }

};


describe("Notifications", () => {

  beforeEach(() => {
    global.__mockOpenAICreate.mockClear();
    global.__mockOpenAICreate.mockResolvedValue({ output_text: "hot" });
  });


  test("a message showing buying intent creates a hot-lead notification", async () => {

    const { authHeader } = await createBusinessAndUser(app, "NotifyHotLead");
    const customerId = await createCustomer(app, authHeader, "Notify Customer");

    await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, message: "I need an estimate for a new roof" });

    const list = await waitFor(async () => {

      const res = await request(app)
        .get("/api/notifications")
        .set("Authorization", authHeader);

      return res.body.length > 0 ? res : null;

    });

    expect(list.status).toBe(200);
    expect(list.body.length).toBe(1);
    expect(list.body[0].type).toBe("hot_lead");
    expect(list.body[0].read).toBe(0);

  });


  test("a message with no buying intent creates no notification", async () => {

    const { authHeader } = await createBusinessAndUser(app, "NotifyNoIntent");
    const customerId = await createCustomer(app, authHeader, "Quiet Customer");

    // First call is the reply itself (generateAIResponse); second is
    // classifyLead - explicitly "cold" here, since the real point of
    // this test is "no buying intent", not whatever the shared mock's
    // default happens to be.
    global.__mockOpenAICreate
      .mockResolvedValueOnce({ output_text: "Sure, happy to help!" })
      .mockResolvedValueOnce({ output_text: "cold" });

    await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, message: "Just saying hello" });

    // Nothing to poll FOR here (the whole point is absence) - a short
    // fixed wait is the standard way to assert a negative against a
    // detached, mocked (near-instant) async chain.
    await new Promise((resolve) => setTimeout(resolve, 150));

    const list = await request(app)
      .get("/api/notifications")
      .set("Authorization", authHeader);

    expect(list.body.length).toBe(0);

  });


  test("a new visitor starting a public chat creates a notification", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "NotifyPublicVisitor");

    const db = require("../../database/db");
    const slug = await new Promise((resolve, reject) => {
      db.get(
        "SELECT slug FROM businesses WHERE id = ?",
        [business_id],
        (err, row) => (err ? reject(err) : resolve(row.slug))
      );
    });

    await request(app)
      .post(`/api/public/${slug}/start`)
      .send({ name: "Public Visitor" });

    const list = await request(app)
      .get("/api/notifications")
      .set("Authorization", authHeader);

    expect(list.body.length).toBe(1);
    expect(list.body[0].type).toBe("new_conversation");
    expect(list.body[0].title).toContain("Public Visitor");

  });


  test("unread count, mark-as-read, and mark-all-as-read all work correctly", async () => {

    const { authHeader } = await createBusinessAndUser(app, "NotifyReadState");
    const customerId = await createCustomer(app, authHeader, "Read State Customer");

    await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, message: "I need a repair estimate" });

    await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, message: "What's the price for a repair?" });

    const listAfterBoth = await waitFor(async () => {

      const res = await request(app)
        .get("/api/notifications")
        .set("Authorization", authHeader);

      return res.body.length >= 2 ? res : null;

    });

    expect(listAfterBoth.body.length).toBe(2);

    const unreadBefore = await request(app)
      .get("/api/notifications/unread-count")
      .set("Authorization", authHeader);

    expect(unreadBefore.body.count).toBe(2);

    const firstId = listAfterBoth.body[0].id;

    const markedOne = await request(app)
      .patch(`/api/notifications/${firstId}/read`)
      .set("Authorization", authHeader);

    expect(markedOne.status).toBe(200);

    const unreadAfterOne = await request(app)
      .get("/api/notifications/unread-count")
      .set("Authorization", authHeader);

    expect(unreadAfterOne.body.count).toBe(1);

    await request(app)
      .patch("/api/notifications/read-all")
      .set("Authorization", authHeader);

    const unreadAfterAll = await request(app)
      .get("/api/notifications/unread-count")
      .set("Authorization", authHeader);

    expect(unreadAfterAll.body.count).toBe(0);

  });


  test("notifications are scoped to the right business", async () => {

    const bizA = await createBusinessAndUser(app, "NotifyIsolationA");
    const bizB = await createBusinessAndUser(app, "NotifyIsolationB");

    const customerId = await createCustomer(app, bizA.authHeader, "Isolation Customer");

    await request(app)
      .post("/api/chat")
      .set("Authorization", bizA.authHeader)
      .send({ customer_id: customerId, message: "I need an estimate" });

    await waitFor(async () => {

      const res = await request(app)
        .get("/api/notifications")
        .set("Authorization", bizA.authHeader);

      return res.body.length > 0 ? res : null;

    });

    const bList = await request(app)
      .get("/api/notifications")
      .set("Authorization", bizB.authHeader);

    expect(bList.body.length).toBe(0);

    const bCount = await request(app)
      .get("/api/notifications/unread-count")
      .set("Authorization", bizB.authHeader);

    expect(bCount.body.count).toBe(0);

  });


  test("marking another business's notification as read is rejected", async () => {

    const bizA = await createBusinessAndUser(app, "NotifyCrossReadA");
    const bizB = await createBusinessAndUser(app, "NotifyCrossReadB");

    const customerId = await createCustomer(app, bizA.authHeader, "Cross Read Customer");

    await request(app)
      .post("/api/chat")
      .set("Authorization", bizA.authHeader)
      .send({ customer_id: customerId, message: "I need an estimate" });

    const list = await waitFor(async () => {

      const res = await request(app)
        .get("/api/notifications")
        .set("Authorization", bizA.authHeader);

      return res.body.length > 0 ? res : null;

    });

    const notificationId = list.body[0].id;

    const crossAttempt = await request(app)
      .patch(`/api/notifications/${notificationId}/read`)
      .set("Authorization", bizB.authHeader);

    expect(crossAttempt.status).toBe(404);

  });

});
