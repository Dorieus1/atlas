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


  // Regression test for a real, user-confirmed fix (2026-09-05): this
  // used to create a brand-new customer every single time someone
  // clicked "Start Chat," even the exact same real person coming back
  // later (closed their browser, switched devices, etc. - anything that
  // lost the frontend's own sessionStorage memory of who they are) -
  // their conversation history ended up split across disconnected
  // customer records unless the owner noticed and manually merged them.
  test("a returning visitor (matched by email) continues their existing customer record instead of getting a new one", async () => {

    const bizRes = await request(app)
      .post("/api/business")
      .send({ name: "Returning Visitor Business" });

    const db = require("../../database/db");
    const slug = await new Promise((resolve, reject) => {
      db.get("SELECT slug FROM businesses WHERE id = ?", [bizRes.body.id], (err, row) => (err ? reject(err) : resolve(row.slug)));
    });

    // Independent rate-limit bucket (see rateLimiter.js) so this test's
    // own two "start chat" calls don't eat into the shared-IP bucket
    // every other test in this file draws from.
    const first = await request(app)
      .post(`/api/public/${slug}/start`)
      .set("X-Test-Client-Id", "start-returning-email")
      .send({ name: "Returning Person", email: "returning@test.com" });

    // A second "Start Chat" for the same real person - the frontend
    // would only ever do this if it lost track of who they were, but
    // the backend shouldn't assume that can't happen.
    const second = await request(app)
      .post(`/api/public/${slug}/start`)
      .set("X-Test-Client-Id", "start-returning-email")
      .send({ name: "Returning Person", email: "returning@test.com" });

    expect(second.status).toBe(201);
    expect(second.body.customer_id).toBe(first.body.customer_id);

    const count = await new Promise((resolve, reject) => {
      db.get(
        "SELECT COUNT(*) as count FROM customers WHERE business_id = ? AND email = ?",
        [bizRes.body.id, "returning@test.com"],
        (err, row) => (err ? reject(err) : resolve(row.count))
      );
    });

    expect(count).toBe(1);

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

  test("a customer trashed mid-conversation can no longer chat or read their own history", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TrashedChatVisitor");

    const slugRes = await request(app)
      .get("/api/business")
      .set("Authorization", authHeader);

    const slug = slugRes.body[0].slug;

    const started = await request(app)
      .post(`/api/public/${slug}/start`)
      .send({ name: "Soon Trashed Visitor" });

    const customerId = started.body.customer_id;

    const firstChat = await request(app)
      .post(`/api/public/${slug}/chat`)
      .send({ customer_id: customerId, message: "Can I book something?" });

    expect(firstChat.status).toBe(200);

    // The owner trashes this customer from the CRM (e.g. spam/abuse)
    // while the visitor's chat tab is still open with its old customer_id
    // still sitting in sessionStorage - it must not go on working as if
    // nothing happened.
    const trashRes = await request(app)
      .delete(`/api/customers/${customerId}`)
      .set("Authorization", authHeader);

    expect(trashRes.status).toBe(200);

    const chatAfterTrash = await request(app)
      .post(`/api/public/${slug}/chat`)
      .send({ customer_id: customerId, message: "Still there?" });

    expect(chatAfterTrash.status).toBe(404);

    const historyAfterTrash = await request(app).get(`/api/public/${slug}/conversations/${customerId}`);

    expect(historyAfterTrash.status).toBe(404);

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
