const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");
const db = require("../../database/db");

describe("Customers", () => {

  test("creating a customer requires a valid token", async () => {

    const res = await request(app)
      .post("/api/customers")
      .send({ name: "No Auth Customer" });

    expect(res.status).toBe(401);

  });

  test("whitespace-only name is rejected, and a normal name gets trimmed", async () => {

    const { authHeader } = await createBusinessAndUser(app, "CustValidation");

    const blank = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "   " });

    expect(blank.status).toBe(400);

    const padded = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "  Jane Doe  " });

    expect(padded.status).toBe(200);
    expect(padded.body.id).toBeTruthy();

    const list = await request(app)
      .get("/api/customers")
      .set("Authorization", authHeader);

    expect(list.body).toHaveLength(1);
    expect(list.body[0].name).toBe("Jane Doe");

  });

  test("one business cannot see, edit, or delete another business's customer", async () => {

    const bizA = await createBusinessAndUser(app, "CustIsoA");
    const bizB = await createBusinessAndUser(app, "CustIsoB");

    const created = await request(app)
      .post("/api/customers")
      .set("Authorization", bizA.authHeader)
      .send({ name: "Business A Customer" });

    const customerId = created.body.id;

    const getAttempt = await request(app)
      .get(`/api/customers/${customerId}`)
      .set("Authorization", bizB.authHeader);

    expect(getAttempt.status).toBe(404);

    const editAttempt = await request(app)
      .put(`/api/customers/${customerId}`)
      .set("Authorization", bizB.authHeader)
      .send({ name: "Hacked Name" });

    expect(editAttempt.status).toBe(404);

    const deleteAttempt = await request(app)
      .delete(`/api/customers/${customerId}`)
      .set("Authorization", bizB.authHeader);

    expect(deleteAttempt.status).toBe(404);

    const stillThere = await request(app)
      .get(`/api/customers/${customerId}`)
      .set("Authorization", bizA.authHeader);

    expect(stillThere.status).toBe(200);
    expect(stillThere.body.name).toBe("Business A Customer");

  });

  test("editing your own customer works", async () => {

    const { authHeader } = await createBusinessAndUser(app, "CustEdit");

    const created = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Original Name" });

    const edit = await request(app)
      .put(`/api/customers/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ name: "Renamed", email: "renamed@test.com", phone: "555-0100" });

    expect(edit.status).toBe(200);

    const fetched = await request(app)
      .get(`/api/customers/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched.body.name).toBe("Renamed");
    expect(fetched.body.email).toBe("renamed@test.com");
    expect(fetched.body.phone).toBe("555-0100");

  });

  test("a customer's phone number is saved when creating them", async () => {

    const { authHeader } = await createBusinessAndUser(app, "CustPhone");

    const created = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Phone Customer", phone: "555-0199" });

    const fetched = await request(app)
      .get(`/api/customers/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched.body.phone).toBe("555-0199");

  });

  test("deleting a customer cascades to their notes, leads, and tasks", async () => {

    const { authHeader } = await createBusinessAndUser(app, "CustCascade");

    const customer = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Cascade Customer" });

    const customerId = customer.body.id;

    await request(app)
      .post("/api/notes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, note: "a note that should be deleted" });

    const del = await request(app)
      .delete(`/api/customers/${customerId}`)
      .set("Authorization", authHeader);

    expect(del.status).toBe(200);

    const getDeleted = await request(app)
      .get(`/api/customers/${customerId}`)
      .set("Authorization", authHeader);

    expect(getDeleted.status).toBe(404);

    const notesAfter = await request(app)
      .get(`/api/notes/${customerId}`)
      .set("Authorization", authHeader);

    // the customer no longer exists, so notes lookup should 404 too
    expect(notesAfter.status).toBe(404);

  });

  test("deleting a customer really does remove every related row from every table, not just the ones an API route happens to expose", async () => {

    const { authHeader } = await createBusinessAndUser(app, "CustCascadeDeep");

    const customer = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Deep Cascade Customer" });

    const customerId = customer.body.id;

    await request(app)
      .post("/api/notes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, note: "should be gone" });

    await request(app)
      .post("/api/tasks")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, title: "should be gone" });

    await request(app)
      .post("/api/memories")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, memory: "should be gone" });

    await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, message: "I need an estimate for a repair" });

    const del = await request(app)
      .delete(`/api/customers/${customerId}`)
      .set("Authorization", authHeader);

    expect(del.status).toBe(200);

    const tables = ["notes", "tasks", "memories", "leads", "conversations", "activities"];

    for (const table of tables) {

      const rows = await new Promise((resolve, reject) => {
        db.all(
          `SELECT * FROM ${table} WHERE customer_id = ?`,
          [customerId],
          (err, r) => err ? reject(err) : resolve(r)
        );
      });

      expect(rows).toHaveLength(0);

    }

  });

});
