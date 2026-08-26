const request = require("supertest");
const { v4: uuidv4 } = require("uuid");
const app = require("../server");
const db = require("../../database/db");
const { createBusinessAndUser } = require("./setup/helpers");


const runAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });
  });

};


const getAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

};


const createCustomer = async (authHeader, name, email, phone) => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name, email, phone });

  return res.body.id;

};


const insertLead = (business_id, customer_id) => {

  return runAsync(

    `INSERT INTO leads (id, customer_id, business_id, name, priority, status) VALUES (?, ?, ?, ?, ?, ?)`,

    [uuidv4(), customer_id, business_id, "Test Lead", "warm", "new"]

  );

};


describe("Merging duplicate customers", () => {

  test("moves quotes, appointments, leads, and notes onto the survivor, and soft-deletes the loser", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "MergeMain");

    const survivorId = await createCustomer(authHeader, "Real Customer", "real@test.com");
    const loserId = await createCustomer(authHeader, "Real Customer", null, "6025550000");

    const quoteRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: loserId, items: [{ description: "Job", quantity: 1, unit_price: 500 }] });

    const apptRes = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ customer_id: loserId, title: "Inspection", start_time: "2026-09-01T10:00:00.000Z" });

    await request(app)
      .post("/api/notes")
      .set("Authorization", authHeader)
      .send({ customer_id: loserId, note: "Called about a leak" });

    await insertLead(business_id, loserId);

    const merged = await request(app)
      .post("/api/customers/merge")
      .set("Authorization", authHeader)
      .send({ survivor_id: survivorId, loser_id: loserId });

    expect(merged.status).toBe(200);
    expect(merged.body.id).toBe(survivorId);

    const quote = await getAsync("SELECT customer_id FROM quotes WHERE id = ?", [quoteRes.body.id]);
    expect(quote.customer_id).toBe(survivorId);

    const appt = await getAsync("SELECT customer_id FROM appointments WHERE id = ?", [apptRes.body.id]);
    expect(appt.customer_id).toBe(survivorId);

    const notes = await request(app)
      .get(`/api/notes/${survivorId}`)
      .set("Authorization", authHeader);

    expect(notes.body.some((n) => n.note === "Called about a leak")).toBe(true);

    const leads = await getAsync("SELECT COUNT(*) as count FROM leads WHERE customer_id = ?", [survivorId]);
    expect(leads.count).toBe(1);

    const loserRow = await getAsync("SELECT deleted_at FROM customers WHERE id = ?", [loserId]);
    expect(loserRow.deleted_at).toBeTruthy();

    // The loser no longer shows up in the normal active customer list...
    const activeList = await request(app).get("/api/customers").set("Authorization", authHeader);
    expect(activeList.body.map((c) => c.id)).not.toContain(loserId);

    // ...but is recoverable from the trash, not gone outright.
    const trashList = await request(app).get("/api/customers/trash").set("Authorization", authHeader);
    expect(trashList.body.map((c) => c.id)).toContain(loserId);

  });


  test("fills a missing email/phone on the survivor from the loser, without overwriting one the survivor already has", async () => {

    const { authHeader } = await createBusinessAndUser(app, "MergeFillGaps");

    // Survivor has an email but no phone; loser has a phone but no email.
    const survivorId = await createCustomer(authHeader, "Gap Fill Customer", "keep@test.com", null);
    const loserId = await createCustomer(authHeader, "Gap Fill Customer", null, "6025551234");

    const merged = await request(app)
      .post("/api/customers/merge")
      .set("Authorization", authHeader)
      .send({ survivor_id: survivorId, loser_id: loserId });

    expect(merged.status).toBe(200);
    expect(merged.body.email).toBe("keep@test.com");
    expect(merged.body.phone).toBe("6025551234");

  });


  test("both customers already sharing a tag doesn't crash or duplicate - the survivor ends up with the union", async () => {

    const { authHeader } = await createBusinessAndUser(app, "MergeTags");

    const survivorId = await createCustomer(authHeader, "Tag Customer", "tagsurvivor@test.com");
    const loserId = await createCustomer(authHeader, "Tag Customer", null, "6025559999");

    const sharedTag = await request(app)
      .post("/api/tags")
      .set("Authorization", authHeader)
      .send({ name: "Shared" });

    const onlyLoserTag = await request(app)
      .post("/api/tags")
      .set("Authorization", authHeader)
      .send({ name: "OnlyOnLoser" });

    await request(app)
      .post(`/api/customers/${survivorId}/tags`)
      .set("Authorization", authHeader)
      .send({ tag_id: sharedTag.body.id });

    await request(app)
      .post(`/api/customers/${loserId}/tags`)
      .set("Authorization", authHeader)
      .send({ tag_id: sharedTag.body.id });

    await request(app)
      .post(`/api/customers/${loserId}/tags`)
      .set("Authorization", authHeader)
      .send({ tag_id: onlyLoserTag.body.id });

    const merged = await request(app)
      .post("/api/customers/merge")
      .set("Authorization", authHeader)
      .send({ survivor_id: survivorId, loser_id: loserId });

    expect(merged.status).toBe(200);

    const tagNames = merged.body.tags.map((t) => t.name).sort();
    expect(tagNames).toEqual(["OnlyOnLoser", "Shared"]);

  });


  test("rejects merging a customer into itself", async () => {

    const { authHeader } = await createBusinessAndUser(app, "MergeSelf");
    const customerId = await createCustomer(authHeader, "Solo Customer", "solo@test.com");

    const res = await request(app)
      .post("/api/customers/merge")
      .set("Authorization", authHeader)
      .send({ survivor_id: customerId, loser_id: customerId });

    expect(res.status).toBe(400);

  });


  test("404s when either customer doesn't exist, or belongs to another business", async () => {

    const bizA = await createBusinessAndUser(app, "MergeTenantA");
    const bizB = await createBusinessAndUser(app, "MergeTenantB");

    const realCustomer = await createCustomer(bizA.authHeader, "Real One", "realone@test.com");
    const otherBizCustomer = await createCustomer(bizB.authHeader, "Other Biz Customer", "otherbiz@test.com");

    const fakeLoser = await request(app)
      .post("/api/customers/merge")
      .set("Authorization", bizA.authHeader)
      .send({ survivor_id: realCustomer, loser_id: "00000000-0000-0000-0000-000000000000" });

    expect(fakeLoser.status).toBe(404);

    const crossTenant = await request(app)
      .post("/api/customers/merge")
      .set("Authorization", bizA.authHeader)
      .send({ survivor_id: realCustomer, loser_id: otherBizCustomer });

    expect(crossTenant.status).toBe(404);

    // Confirm the cross-tenant attempt didn't touch the other business's
    // customer at all.
    const untouchedCheck = await request(app)
      .get(`/api/customers/${otherBizCustomer}`)
      .set("Authorization", bizB.authHeader);

    expect(untouchedCheck.status).toBe(200);
    expect(untouchedCheck.body.deleted_at).toBeFalsy();

  });

});
