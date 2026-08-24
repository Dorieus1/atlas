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

describe("Notifications", () => {

  test("a message showing buying intent creates a hot-lead notification", async () => {

    const { authHeader } = await createBusinessAndUser(app, "NotifyHotLead");
    const customerId = await createCustomer(app, authHeader, "Notify Customer");

    await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, message: "I need an estimate for a new roof" });

    const list = await request(app)
      .get("/api/notifications")
      .set("Authorization", authHeader);

    expect(list.status).toBe(200);
    expect(list.body.length).toBe(1);
    expect(list.body[0].type).toBe("hot_lead");
    expect(list.body[0].read).toBe(0);

  });

  test("a message with no buying intent creates no notification", async () => {

    const { authHeader } = await createBusinessAndUser(app, "NotifyNoIntent");
    const customerId = await createCustomer(app, authHeader, "Quiet Customer");

    await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, message: "Just saying hello" });

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

    const unreadBefore = await request(app)
      .get("/api/notifications/unread-count")
      .set("Authorization", authHeader);

    expect(unreadBefore.body.count).toBe(2);

    const list = await request(app)
      .get("/api/notifications")
      .set("Authorization", authHeader);

    const firstId = list.body[0].id;

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

    const list = await request(app)
      .get("/api/notifications")
      .set("Authorization", bizA.authHeader);

    const notificationId = list.body[0].id;

    const crossAttempt = await request(app)
      .patch(`/api/notifications/${notificationId}/read`)
      .set("Authorization", bizB.authHeader);

    expect(crossAttempt.status).toBe(404);

  });

});
