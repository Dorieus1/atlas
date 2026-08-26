const request = require("supertest");
const { v4: uuidv4 } = require("uuid");
const app = require("../server");
const db = require("../../database/db");
const { createBusinessAndUser } = require("./setup/helpers");
const { lastSixMonthKeys } = require("../services/analyticsService");


const createInvoice = async (authHeader, customerId, amount) => {

  const res = await request(app)
    .post("/api/quotes")
    .set("Authorization", authHeader)
    .send({
      customer_id: customerId,
      type: "invoice",
      items: [{ description: "Job", quantity: 1, unit_price: amount }]
    });

  return res.body.id;

};


const runAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });
  });

};


// leads has no dedicated POST route (leads are created internally by
// chatService via the AI classifier) - inserted directly, same pattern
// dailyDigest.test.js already uses for the same reason.
const insertLead = (business_id, customer_id, status) => {

  return runAsync(

    `
    INSERT INTO leads (id, customer_id, business_id, name, priority, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,

    [uuidv4(), customer_id, business_id, "Test Lead", "warm", status, new Date().toISOString()]

  );

};


describe("Analytics", () => {

  test("a fresh business has all-zero stats", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AnalyticsFresh");

    const res = await request(app)
      .get("/api/analytics")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body.customers).toBe(0);
    expect(res.body.revenuePaid).toBe(0);
    expect(res.body.revenueOutstanding).toBe(0);
    expect(res.body.paidInvoiceCount).toBe(0);
    expect(res.body.outstandingInvoiceCount).toBe(0);
    expect(res.body.revenueByMonth).toHaveLength(6);
    expect(res.body.revenueByMonth.every((m) => m.total === 0)).toBe(true);
    expect(res.body.leadsByStatus).toEqual({ new: 0, contacted: 0, qualified: 0, closed: 0 });

  });


  test("leadsByStatus reflects real pipeline counts, scoped to the right business", async () => {

    const bizA = await createBusinessAndUser(app, "AnalyticsPipelineA");
    const bizB = await createBusinessAndUser(app, "AnalyticsPipelineB");

    const customerA = await request(app)
      .post("/api/customers")
      .set("Authorization", bizA.authHeader)
      .send({ name: "Pipeline Customer A" });

    const customerB = await request(app)
      .post("/api/customers")
      .set("Authorization", bizB.authHeader)
      .send({ name: "Pipeline Customer B" });

    await insertLead(bizA.business_id, customerA.body.id, "new");
    await insertLead(bizA.business_id, customerA.body.id, "new");
    await insertLead(bizA.business_id, customerA.body.id, "contacted");
    await insertLead(bizA.business_id, customerA.body.id, "qualified");
    await insertLead(bizA.business_id, customerA.body.id, "closed");

    // A different business's leads must never leak into bizA's counts.
    await insertLead(bizB.business_id, customerB.body.id, "new");
    await insertLead(bizB.business_id, customerB.body.id, "new");

    const res = await request(app)
      .get("/api/analytics")
      .set("Authorization", bizA.authHeader);

    expect(res.status).toBe(200);
    expect(res.body.leads).toBe(5);
    expect(res.body.leadsByStatus).toEqual({
      new: 2,
      contacted: 1,
      qualified: 1,
      closed: 1
    });

  });


  test("paid invoices count toward revenue, sent/accepted count as outstanding, drafts count toward neither", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AnalyticsRevenue");

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Revenue Customer" });

    const customerId = customerRes.body.id;

    const paidId = await createInvoice(authHeader, customerId, 500);
    await request(app)
      .patch(`/api/quotes/${paidId}`)
      .set("Authorization", authHeader)
      .send({ status: "paid" });

    const sentId = await createInvoice(authHeader, customerId, 300);
    await request(app)
      .patch(`/api/quotes/${sentId}`)
      .set("Authorization", authHeader)
      .send({ status: "sent" });

    // A draft, left untouched, shouldn't count toward either bucket.
    await createInvoice(authHeader, customerId, 999);

    const res = await request(app)
      .get("/api/analytics")
      .set("Authorization", authHeader);

    expect(res.body.revenuePaid).toBe(500);
    expect(res.body.revenueOutstanding).toBe(300);
    expect(res.body.paidInvoiceCount).toBe(1);
    expect(res.body.outstandingInvoiceCount).toBe(1);

    const currentMonthTotal = res.body.revenueByMonth[res.body.revenueByMonth.length - 1].total;
    expect(currentMonthTotal).toBe(500);

  });


  test("a plain quote (not an invoice), even if marked paid, never counts as revenue", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AnalyticsQuoteNotInvoice");

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Quote Customer" });

    const quoteRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerRes.body.id, type: "quote", items: [{ description: "Estimate", quantity: 1, unit_price: 1000 }] });

    await request(app)
      .patch(`/api/quotes/${quoteRes.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "paid" });

    const res = await request(app)
      .get("/api/analytics")
      .set("Authorization", authHeader);

    expect(res.body.revenuePaid).toBe(0);

  });


  describe("lastSixMonthKeys", () => {

    afterEach(() => {
      jest.useRealTimers();
    });

    // paid_at is stored and read entirely in UTC (new Date().toISOString(),
    // then SQLite's strftime on that string), so the generated keys must
    // be computed in UTC too - mixing in local-time arithmetic previously
    // shifted every key back by one in any positive-UTC-offset timezone.
    // Fake timers pin "now" to an exact instant so this is deterministic
    // regardless of the machine actually running the test; mutating
    // process.env.TZ mid-process is NOT a reliable way to test this, since
    // Node's Date internals don't consistently pick up a TZ change made
    // after the process has already started.
    test("returns the last 6 UTC year-months, ending with the current one", () => {

      jest.useFakeTimers().setSystemTime(new Date("2026-08-24T21:06:57.445Z"));

      expect(lastSixMonthKeys()).toEqual([
        "2026-03",
        "2026-04",
        "2026-05",
        "2026-06",
        "2026-07",
        "2026-08"
      ]);

    });

    test("rolls over the year boundary correctly", () => {

      jest.useFakeTimers().setSystemTime(new Date("2026-02-10T03:00:00.000Z"));

      expect(lastSixMonthKeys()).toEqual([
        "2025-09",
        "2025-10",
        "2025-11",
        "2025-12",
        "2026-01",
        "2026-02"
      ]);

    });

  });


  test("revenue is scoped to the right business", async () => {

    const bizA = await createBusinessAndUser(app, "AnalyticsScopeA");
    const bizB = await createBusinessAndUser(app, "AnalyticsScopeB");

    const customerA = await request(app)
      .post("/api/customers")
      .set("Authorization", bizA.authHeader)
      .send({ name: "A Customer" });

    const invoiceId = await createInvoice(bizA.authHeader, customerA.body.id, 750);
    await request(app)
      .patch(`/api/quotes/${invoiceId}`)
      .set("Authorization", bizA.authHeader)
      .send({ status: "paid" });

    const resB = await request(app)
      .get("/api/analytics")
      .set("Authorization", bizB.authHeader);

    expect(resB.body.revenuePaid).toBe(0);

  });

});
