const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");

describe("Public chat page", () => {

  test("a new business gets a unique, url-safe slug automatically", async () => {

    const bizRes = await request(app)
      .post("/api/business")
      .send({ name: "PublicSlugTest Business" });

    expect(bizRes.body.id).toBeTruthy();

    const rows = await new Promise((resolve, reject) => {

      const db = require("../../database/db");

      db.get(
        "SELECT slug FROM businesses WHERE id = ?",
        [bizRes.body.id],
        (err, row) => (err ? reject(err) : resolve(row))
      );

    });

    expect(rows.slug).toMatch(/^[a-z0-9-]+$/);

  });

  test("two businesses with the same name get different slugs", async () => {

    const first = await request(app)
      .post("/api/business")
      .send({ name: "Duplicate Name Co" });

    const second = await request(app)
      .post("/api/business")
      .send({ name: "Duplicate Name Co" });

    const db = require("../../database/db");

    const getSlug = (id) => new Promise((resolve, reject) => {
      db.get("SELECT slug FROM businesses WHERE id = ?", [id], (err, row) => (err ? reject(err) : resolve(row.slug)));
    });

    const slug1 = await getSlug(first.body.id);
    const slug2 = await getSlug(second.body.id);

    expect(slug1).not.toBe(slug2);

  });

  test("looking up a business by its public slug returns just its name, and an unknown slug 404s", async () => {

    const bizRes = await request(app)
      .post("/api/business")
      .send({ name: "Lookup Test Business" });

    const db = require("../../database/db");
    const slug = await new Promise((resolve, reject) => {
      db.get("SELECT slug FROM businesses WHERE id = ?", [bizRes.body.id], (err, row) => (err ? reject(err) : resolve(row.slug)));
    });

    const found = await request(app).get(`/api/public/${slug}`);

    expect(found.status).toBe(200);
    expect(found.body.name).toBe("Lookup Test Business");

    const notFound = await request(app).get("/api/public/not-a-real-slug-at-all");

    expect(notFound.status).toBe(404);

  });

  test("starting a conversation requires a name and creates a real customer record", async () => {

    const bizRes = await request(app)
      .post("/api/business")
      .send({ name: "Start Convo Business" });

    const db = require("../../database/db");
    const slug = await new Promise((resolve, reject) => {
      db.get("SELECT slug FROM businesses WHERE id = ?", [bizRes.body.id], (err, row) => (err ? reject(err) : resolve(row.slug)));
    });

    const noName = await request(app)
      .post(`/api/public/${slug}/start`)
      .send({});

    expect(noName.status).toBe(400);

    const started = await request(app)
      .post(`/api/public/${slug}/start`)
      .send({ name: "Anonymous Visitor" });

    expect(started.status).toBe(201);
    expect(started.body.customer_id).toBeTruthy();

  });

  test("a public visitor can send a message and get a reply, and it's saved to their history", async () => {

    const bizRes = await request(app)
      .post("/api/business")
      .send({ name: "Public Chat Business" });

    const db = require("../../database/db");
    const slug = await new Promise((resolve, reject) => {
      db.get("SELECT slug FROM businesses WHERE id = ?", [bizRes.body.id], (err, row) => (err ? reject(err) : resolve(row.slug)));
    });

    const started = await request(app)
      .post(`/api/public/${slug}/start`)
      .send({ name: "Chatty Visitor" });

    const customerId = started.body.customer_id;

    const chat = await request(app)
      .post(`/api/public/${slug}/chat`)
      .send({ customer_id: customerId, message: "Do you have any openings this week?" });

    expect(chat.status).toBe(200);
    expect(chat.body.reply).toBeTruthy();

    const history = await request(app).get(`/api/public/${slug}/conversations/${customerId}`);

    expect(history.status).toBe(200);
    expect(history.body.length).toBe(1);
    expect(history.body[0].message).toBe("Do you have any openings this week?");

  });

  test("a customer_id from a different business is rejected, both for chatting and for reading history", async () => {

    const bizARes = await request(app)
      .post("/api/business")
      .send({ name: "Isolation Business A" });

    const bizBRes = await request(app)
      .post("/api/business")
      .send({ name: "Isolation Business B" });

    const db = require("../../database/db");
    const getSlug = (id) => new Promise((resolve, reject) => {
      db.get("SELECT slug FROM businesses WHERE id = ?", [id], (err, row) => (err ? reject(err) : resolve(row.slug)));
    });

    const slugA = await getSlug(bizARes.body.id);
    const slugB = await getSlug(bizBRes.body.id);

    const started = await request(app)
      .post(`/api/public/${slugA}/start`)
      .send({ name: "A's Visitor" });

    const customerId = started.body.customer_id;

    const crossChat = await request(app)
      .post(`/api/public/${slugB}/chat`)
      .send({ customer_id: customerId, message: "Sneaking into business B" });

    expect(crossChat.status).toBe(404);

    const crossHistory = await request(app).get(`/api/public/${slugB}/conversations/${customerId}`);

    expect(crossHistory.status).toBe(404);

  });

  test("the existing logged-in chat endpoint still works after the shared refactor", async () => {

    const { authHeader } = await createBusinessAndUser(app, "StaffChatStillWorks");

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Staff Side Customer" });

    const chat = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerRes.body.id, message: "Hello from staff side" });

    expect(chat.status).toBe(200);
    expect(chat.body.reply).toBeTruthy();

  });

});
