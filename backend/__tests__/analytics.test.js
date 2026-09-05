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
const insertLead = (business_id, customer_id, status, source = null) => {

  return runAsync(

    `
    INSERT INTO leads (id, customer_id, business_id, name, priority, status, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,

    [uuidv4(), customer_id, business_id, "Test Lead", "warm", status, source, new Date().toISOString()]

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
    expect(res.body.expensesPaid).toBe(0);
    expect(res.body.totalMargin).toBe(0);
    expect(res.body.repeatCustomerRate).toBe(0);
    expect(res.body.avgCustomerValue).toBe(0);
    expect(res.body.activeServiceAgreements).toBe(0);
    expect(res.body.monthlyRecurringRevenue).toBe(0);

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


  test("leadsBySource groups by real source, labels an unset source as 'Not set', and stays scoped to the right business", async () => {

    const bizA = await createBusinessAndUser(app, "AnalyticsSourceA");
    const bizB = await createBusinessAndUser(app, "AnalyticsSourceB");

    const customerA = await request(app)
      .post("/api/customers")
      .set("Authorization", bizA.authHeader)
      .send({ name: "Source Customer A" });

    const customerB = await request(app)
      .post("/api/customers")
      .set("Authorization", bizB.authHeader)
      .send({ name: "Source Customer B" });

    await insertLead(bizA.business_id, customerA.body.id, "new", "google");
    await insertLead(bizA.business_id, customerA.body.id, "new", "google");
    await insertLead(bizA.business_id, customerA.body.id, "new", "referral");
    await insertLead(bizA.business_id, customerA.body.id, "new", null);

    // A different business's leads must never leak into bizA's breakdown.
    await insertLead(bizB.business_id, customerB.body.id, "new", "google");

    const res = await request(app)
      .get("/api/analytics")
      .set("Authorization", bizA.authHeader);

    expect(res.status).toBe(200);

    const bySource = Object.fromEntries(res.body.leadsBySource.map((row) => [row.source, row]));

    expect(bySource.google.count).toBe(2);
    expect(bySource.google.label).toBe("Google");
    expect(bySource.referral.count).toBe(1);
    expect(bySource.not_set.count).toBe(1);
    expect(bySource.not_set.label).toBe("Not set");

  });


  test("revenue reflects the actual discounted total, not the pre-discount subtotal - Stripe only ever charges the discounted amount", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AnalyticsDiscountRevenue");

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Discount Revenue Customer" });

    const customerId = customerRes.body.id;

    // $1000 subtotal, 20% off -> $800 actually charged and collected.
    const paidRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        type: "invoice",
        items: [{ description: "Job", quantity: 1, unit_price: 1000 }],
        discount_type: "percent",
        discount_value: 20
      });

    await request(app)
      .patch(`/api/quotes/${paidRes.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "paid" });

    // $500 subtotal, $100 off -> $400 actually still owed.
    const outstandingRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        type: "invoice",
        items: [{ description: "Job 2", quantity: 1, unit_price: 500 }],
        discount_type: "fixed",
        discount_value: 100
      });

    await request(app)
      .patch(`/api/quotes/${outstandingRes.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "sent" });

    const res = await request(app)
      .get("/api/analytics")
      .set("Authorization", authHeader);

    expect(res.body.revenuePaid).toBe(800);
    expect(res.body.revenueOutstanding).toBe(400);

    const currentMonthTotal = res.body.revenueByMonth[res.body.revenueByMonth.length - 1].total;
    expect(currentMonthTotal).toBe(800);

  });


  test("repeat customer rate and average customer value are computed per-customer, not per-invoice", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AnalyticsRepeatCustomers");

    const repeatCustomer = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Repeat Customer" });

    const oneTimeCustomer = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "One-Time Customer" });

    const neverPaidCustomer = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Never Paid Customer" });

    // Repeat customer: two separate paid invoices, $100 and $300.
    const repeatInvoice1 = await createInvoice(authHeader, repeatCustomer.body.id, 100);
    await request(app).patch(`/api/quotes/${repeatInvoice1}`).set("Authorization", authHeader).send({ status: "paid" });

    const repeatInvoice2 = await createInvoice(authHeader, repeatCustomer.body.id, 300);
    await request(app).patch(`/api/quotes/${repeatInvoice2}`).set("Authorization", authHeader).send({ status: "paid" });

    // One-time customer: a single paid invoice, $200.
    const oneTimeInvoice = await createInvoice(authHeader, oneTimeCustomer.body.id, 200);
    await request(app).patch(`/api/quotes/${oneTimeInvoice}`).set("Authorization", authHeader).send({ status: "paid" });

    // Never-paid customer: a draft invoice that should count toward
    // neither the paying-customer pool nor its rate/value.
    await createInvoice(authHeader, neverPaidCustomer.body.id, 500);

    const res = await request(app)
      .get("/api/analytics")
      .set("Authorization", authHeader);

    // 1 of 2 paying customers (repeatCustomer) paid more than once = 50%.
    expect(res.body.repeatCustomerRate).toBe(50);

    // $600 total collected across 2 paying customers = $300 average -
    // the never-paid customer must not dilute this toward a 3rd share.
    expect(res.body.revenuePaid).toBe(600);
    expect(res.body.avgCustomerValue).toBe(300);

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


  test("margin nets expenses against paid invoices only - an expense on an unpaid invoice doesn't count yet", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AnalyticsMargin");

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Margin Customer" });

    const customerId = customerRes.body.id;

    const paidId = await createInvoice(authHeader, customerId, 1000);

    await request(app)
      .post(`/api/quotes/${paidId}/expenses`)
      .set("Authorization", authHeader)
      .send({ description: "Materials", amount: 300 });

    await request(app)
      .patch(`/api/quotes/${paidId}`)
      .set("Authorization", authHeader)
      .send({ status: "paid" });

    // Expense logged against a still-outstanding invoice - shouldn't be
    // netted against anything yet, since the business hasn't actually
    // collected that revenue.
    const outstandingId = await createInvoice(authHeader, customerId, 800);

    await request(app)
      .post(`/api/quotes/${outstandingId}/expenses`)
      .set("Authorization", authHeader)
      .send({ description: "Materials", amount: 150 });

    await request(app)
      .patch(`/api/quotes/${outstandingId}`)
      .set("Authorization", authHeader)
      .send({ status: "sent" });

    const res = await request(app)
      .get("/api/analytics")
      .set("Authorization", authHeader);

    expect(res.body.revenuePaid).toBe(1000);
    expect(res.body.expensesPaid).toBe(300);
    expect(res.body.totalMargin).toBe(700);

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


  // Regression test for a real bug a review caught: a Good/Better/Best
  // invoice stores every tier's line items in quote_items (not just the
  // one the customer accepted), and revenue used to be a plain
  // SUM(quantity * unit_price) with no tier filter - so a paid tiered
  // invoice counted ALL of its options' prices as revenue, not just the
  // one actually sold.
  test("a paid tiered (Good/Better/Best) invoice only counts the ACCEPTED tier as revenue, not every option", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AnalyticsTieredRevenue");

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Tiered Revenue Customer" });

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({

        customer_id: customerRes.body.id,
        type: "invoice",
        items: [{ description: "Site visit fee", quantity: 1, unit_price: 25 }],

        tiers: [
          { name: "Good", items: [{ description: "Basic repair", quantity: 1, unit_price: 200 }] },
          { name: "Better", is_recommended: true, items: [{ description: "Full repair", quantity: 1, unit_price: 400 }] },
          { name: "Best", items: [{ description: "Full replacement", quantity: 1, unit_price: 900 }] }
        ]

      });

    expect(created.status).toBe(201);

    const fetched = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    // 25 shared + 200 Good = 225 - the CHEAPEST option, deliberately not
    // the recommended ("Better", 425) or the most expensive ("Best",
    // 925), so a bug that summed every tier or defaulted to the
    // recommended one would both be caught.
    const goodTierId = fetched.body.tiers.find((t) => t.name === "Good").id;

    await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "sent" });

    await request(app)
      .post(`/api/quotes/${created.body.id}/sign`)
      .set("Authorization", authHeader)
      .send({ name: "Real Signer", signature: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", tier_id: goodTierId });

    await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "paid" });

    const res = await request(app)
      .get("/api/analytics")
      .set("Authorization", authHeader);

    expect(res.body.revenuePaid).toBe(225);

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


  describe("Recurring revenue (service agreements)", () => {

    const createPlan = async (authHeader, customerId, overrides = {}) => {

      return request(app)
        .post("/api/service-agreements")
        .set("Authorization", authHeader)
        .send({
          customer_id: customerId,
          title: "Test Plan",
          frequency: "monthly",
          start_date: "2026-09-01T09:00:00.000Z",
          price: 100,
          ...overrides
        });

    };

    test("monthlyRecurringRevenue converts every plan's cadence to a monthly-equivalent, and excludes paused/cancelled/priceless plans", async () => {

      const { authHeader } = await createBusinessAndUser(app, "AnalyticsMRR");

      const customerId = (await request(app)
        .post("/api/customers")
        .set("Authorization", authHeader)
        .send({ name: "MRR Customer" })).body.id;

      // Monthly $100 -> $100/mo.
      await createPlan(authHeader, customerId, { frequency: "monthly", price: 100 });

      // Weekly $50 -> 50 * 52/12 = 216.666... -> rounds to 216.67.
      await createPlan(authHeader, customerId, { frequency: "weekly", price: 50 });

      // Paused - must not count.
      const paused = await createPlan(authHeader, customerId, { frequency: "monthly", price: 500 });
      await request(app)
        .patch(`/api/service-agreements/${paused.body.id}/status`)
        .set("Authorization", authHeader)
        .send({ status: "paused" });

      // Cancelled - must not count.
      const cancelled = await createPlan(authHeader, customerId, { frequency: "monthly", price: 500 });
      await request(app)
        .patch(`/api/service-agreements/${cancelled.body.id}/status`)
        .set("Authorization", authHeader)
        .send({ status: "cancelled" });

      // Active but no price - counts toward activeServiceAgreements,
      // contributes $0 to the revenue figure.
      await createPlan(authHeader, customerId, { frequency: "monthly", price: undefined });

      const res = await request(app)
        .get("/api/analytics")
        .set("Authorization", authHeader);

      expect(res.body.activeServiceAgreements).toBe(3);
      expect(res.body.monthlyRecurringRevenue).toBe(316.67);

    });

  });

});
