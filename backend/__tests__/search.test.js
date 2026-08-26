const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");

// Lead creation now runs detached from the chat response (see
// chatService.js's runLeadDetection), so it isn't guaranteed to be
// indexed yet the instant POST /api/chat returns. Polls briefly
// rather than asserting immediately.
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


describe("Search", () => {

  test("a query under 2 characters returns empty results instead of erroring", async () => {

    const { authHeader } = await createBusinessAndUser(app, "SearchShort");

    const res = await request(app)
      .get("/api/search?q=a")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ customers: [], leads: [], appointments: [], quotes: [] });

  });


  test("finds a customer by name, email, or phone", async () => {

    const { authHeader } = await createBusinessAndUser(app, "SearchCustomer");

    await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Jamie Rivera", email: "jamie.rivera@test.com", phone: "6025551234" });

    const byName = await request(app)
      .get("/api/search?q=Rivera")
      .set("Authorization", authHeader);

    expect(byName.body.customers.length).toBe(1);
    expect(byName.body.customers[0].title).toBe("Jamie Rivera");

    const byEmail = await request(app)
      .get("/api/search?q=jamie.rivera")
      .set("Authorization", authHeader);

    expect(byEmail.body.customers.length).toBe(1);

    const byPhone = await request(app)
      .get("/api/search?q=6025551234")
      .set("Authorization", authHeader);

    expect(byPhone.body.customers.length).toBe(1);

  });


  test("finds an appointment by title or by its linked customer's name", async () => {

    const { authHeader } = await createBusinessAndUser(app, "SearchAppointment");

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Morgan Chen" });

    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ customer_id: customerRes.body.id, title: "Roof leak inspection", start_time: "2026-09-01T10:00:00.000Z" });

    const byTitle = await request(app)
      .get("/api/search?q=leak inspection")
      .set("Authorization", authHeader);

    expect(byTitle.body.appointments.length).toBe(1);

    const byCustomer = await request(app)
      .get("/api/search?q=Morgan Chen")
      .set("Authorization", authHeader);

    expect(byCustomer.body.appointments.length).toBe(1);
    expect(byCustomer.body.customers.length).toBe(1);

  });


  test("finds a quote by its customer's name", async () => {

    const { authHeader } = await createBusinessAndUser(app, "SearchQuote");

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Priya Patel" });

    await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerRes.body.id, type: "invoice", items: [{ description: "Job", quantity: 1, unit_price: 200 }] });

    const res = await request(app)
      .get("/api/search?q=Priya")
      .set("Authorization", authHeader);

    expect(res.body.quotes.length).toBe(1);
    expect(res.body.quotes[0].title).toBe("Invoice for Priya Patel");

  });


  test("finds a lead by name or interest", async () => {

    const { authHeader } = await createBusinessAndUser(app, "SearchLead");

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Terry Nakamura", email: "terry@test.com" });

    await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerRes.body.id, message: "Can I get a price estimate for a new roof?" });

    const byInterest = await waitFor(async () => {

      const res = await request(app)
        .get("/api/search?q=price estimate")
        .set("Authorization", authHeader);

      return res.body.leads.length > 0 ? res : null;

    });

    expect(byInterest.body.leads.length).toBeGreaterThanOrEqual(1);

  });


  test("results are scoped to the right business", async () => {

    const bizA = await createBusinessAndUser(app, "SearchScopeA");
    const bizB = await createBusinessAndUser(app, "SearchScopeB");

    await request(app)
      .post("/api/customers")
      .set("Authorization", bizA.authHeader)
      .send({ name: "Exclusive To A" });

    const res = await request(app)
      .get("/api/search?q=Exclusive")
      .set("Authorization", bizB.authHeader);

    expect(res.body.customers.length).toBe(0);

  });

});
