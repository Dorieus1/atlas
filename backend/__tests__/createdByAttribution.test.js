const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");

const VALID_ITEMS = [
  { description: "Roof inspection", quantity: 1, unit_price: 150 }
];

const inviteTeammate = async (app, authHeader, { name, email, password = "teammatepass123" }) => {

  const res = await request(app)
    .post("/api/auth/teammates")
    .set("Authorization", authHeader)
    .send({ name, email, password });

  return res.body.id;

};

const loginAs = async (app, email, password = "teammatepass123") => {

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password });

  return `Bearer ${res.body.token}`;

};

describe("Added by attribution", () => {

  test("a customer created by an authenticated user gets created_by_user_id and created_by_name", async () => {

    const owner = await createBusinessAndUser(app, "AttribCustomer");

    const created = await request(app)
      .post("/api/customers")
      .set("Authorization", owner.authHeader)
      .send({ name: "Attributed Customer" });

    expect(created.status).toBe(200);

    const fetched = await request(app)
      .get(`/api/customers/${created.body.id}`)
      .set("Authorization", owner.authHeader);

    expect(fetched.status).toBe(200);
    expect(fetched.body.created_by_user_id).toBe(owner.userId);
    expect(fetched.body.created_by_name).toBe("Test Owner");

  });

  test("a quote created by an authenticated user gets created_by_user_id and created_by_name", async () => {

    const owner = await createBusinessAndUser(app, "AttribQuote");

    const customer = await request(app)
      .post("/api/customers")
      .set("Authorization", owner.authHeader)
      .send({ name: "Quote Customer" });

    const quote = await request(app)
      .post("/api/quotes")
      .set("Authorization", owner.authHeader)
      .send({ customer_id: customer.body.id, items: VALID_ITEMS });

    expect(quote.status).toBe(201);

    const fetched = await request(app)
      .get(`/api/quotes/${quote.body.id}`)
      .set("Authorization", owner.authHeader);

    expect(fetched.status).toBe(200);
    expect(fetched.body.created_by_user_id).toBe(owner.userId);
    expect(fetched.body.created_by_name).toBe("Test Owner");

  });

  test("a single appointment created by an authenticated user gets created_by_user_id and created_by_name", async () => {

    const owner = await createBusinessAndUser(app, "AttribAppt");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", owner.authHeader)
      .send({
        title: "Roof estimate",
        start_time: "2026-09-10T14:00:00.000Z"
      });

    expect(created.status).toBe(201);

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", owner.authHeader);

    const appt = list.body.find((a) => a.id === created.body.id);

    expect(appt.created_by_user_id).toBe(owner.userId);
    expect(appt.created_by_name).toBe("Test Owner");

  });

  test("every occurrence of a recurring appointment series shares the same attribution", async () => {

    const owner = await createBusinessAndUser(app, "AttribRecur");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", owner.authHeader)
      .send({
        title: "Monthly maintenance",
        start_time: "2026-09-01T09:00:00.000Z",
        recurrence: "monthly",
        occurrences: 3
      });

    expect(created.status).toBe(201);

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", owner.authHeader);

    const series = list.body.filter((a) => a.recurrence_id === created.body.recurrence_id);

    expect(series.length).toBe(3);

    series.forEach((appt) => {
      expect(appt.created_by_user_id).toBe(owner.userId);
      expect(appt.created_by_name).toBe("Test Owner");
    });

  });

  test("a customer created via the public chat widget has no attribution - both fields are NULL, not an error or a fake value", async () => {

    const bizRes = await request(app)
      .post("/api/business")
      .send({ name: "Public Widget Business" });

    const business_id = bizRes.body.id;

    // Register an owner after the fact purely so this test can log in and
    // read the customer record back - the widget itself never
    // authenticates.
    await request(app)
      .post("/api/auth/register")
      .send({
        business_id,
        name: "Widget Business Owner",
        email: "widget-owner@test.com",
        password: "ownerpass123"
      });

    const ownerAuth = await loginAs(app, "widget-owner@test.com", "ownerpass123");

    const db = require("../../database/db");
    const slug = await new Promise((resolve, reject) => {
      db.get("SELECT slug FROM businesses WHERE id = ?", [business_id], (err, row) => (err ? reject(err) : resolve(row.slug)));
    });

    const started = await request(app)
      .post(`/api/public/${slug}/start`)
      .send({ name: "Anonymous Widget Visitor" });

    expect(started.status).toBe(201);

    const fetched = await request(app)
      .get(`/api/customers/${started.body.customer_id}`)
      .set("Authorization", ownerAuth);

    expect(fetched.status).toBe(200);
    expect(fetched.body.created_by_user_id).toBeNull();
    expect(fetched.body.created_by_name).toBeNull();

  });

  test("removing a teammate does not erase attribution on records they created - the denormalized name snapshot survives the hard delete", async () => {

    const owner = await createBusinessAndUser(app, "AttribSurvives");

    const teammateId = await inviteTeammate(app, owner.authHeader, {
      name: "Departing Teammate",
      email: "departing-teammate@test.com"
    });

    const teammateAuth = await loginAs(app, "departing-teammate@test.com");

    const customer = await request(app)
      .post("/api/customers")
      .set("Authorization", teammateAuth)
      .send({ name: "Customer Added By Teammate" });

    expect(customer.status).toBe(200);

    // Confirm attribution is correct before removal.
    const beforeRemoval = await request(app)
      .get(`/api/customers/${customer.body.id}`)
      .set("Authorization", owner.authHeader);

    expect(beforeRemoval.body.created_by_user_id).toBe(teammateId);
    expect(beforeRemoval.body.created_by_name).toBe("Departing Teammate");

    // Hard-delete the teammate's login (authController.removeTeammate
    // does a real DELETE FROM users, not a deactivation flag).
    const removal = await request(app)
      .delete(`/api/auth/teammates/${teammateId}`)
      .set("Authorization", owner.authHeader);

    expect(removal.status).toBe(200);

    // The teammate's row is gone - confirm the record's attribution is
    // still intact, proving created_by_name is a stored snapshot and not
    // a live join to `users`.
    const afterRemoval = await request(app)
      .get(`/api/customers/${customer.body.id}`)
      .set("Authorization", owner.authHeader);

    expect(afterRemoval.status).toBe(200);
    expect(afterRemoval.body.created_by_user_id).toBe(teammateId);
    expect(afterRemoval.body.created_by_name).toBe("Departing Teammate");

  });


  test("an appointment assigned to a removed teammate reverts to unassigned, not a dangling reference", async () => {

    const owner = await createBusinessAndUser(app, "AttribAssignee");

    const teammateId = await inviteTeammate(app, owner.authHeader, {
      name: "Assigned Teammate",
      email: "assignedteammate@test.com"
    });

    const customer = await request(app)
      .post("/api/customers")
      .set("Authorization", owner.authHeader)
      .send({ name: "Assignment Customer" });

    const appointment = await request(app)
      .post("/api/appointments")
      .set("Authorization", owner.authHeader)
      .send({
        customer_id: customer.body.id,
        title: "Roof inspection",
        start_time: "2026-09-01T10:00:00.000Z",
        assigned_user_id: teammateId
      });

    expect(appointment.status).toBe(201);

    const beforeRemoval = await request(app)
      .get("/api/appointments")
      .set("Authorization", owner.authHeader);

    expect(beforeRemoval.body.find((a) => a.id === appointment.body.id).assigned_user_id).toBe(teammateId);

    await request(app)
      .delete(`/api/auth/teammates/${teammateId}`)
      .set("Authorization", owner.authHeader);

    const afterRemoval = await request(app)
      .get("/api/appointments")
      .set("Authorization", owner.authHeader);

    const updated = afterRemoval.body.find((a) => a.id === appointment.body.id);

    expect(updated.assigned_user_id).toBeNull();

  });

});
