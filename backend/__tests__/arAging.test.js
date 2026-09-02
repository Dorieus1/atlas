const request = require("supertest");
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


const createCustomer = async (authHeader, name = "AR Customer") => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name });

  return res.body.id;

};


const createInvoice = async (authHeader, customerId, amount, overrides = {}) => {

  const res = await request(app)
    .post("/api/quotes")
    .set("Authorization", authHeader)
    .send({
      customer_id: customerId,
      type: "invoice",
      items: [{ description: "Job", quantity: 1, unit_price: amount }],
      ...overrides
    });

  return res.body.id;

};


const sendInvoice = (authHeader, id) =>
  request(app)
    .patch(`/api/quotes/${id}`)
    .set("Authorization", authHeader)
    .send({ status: "sent" });


// The API stamps sent_at to "now" the moment a quote transitions to
// "sent" (updateQuoteFields) with no way to backdate it through the
// endpoint - directly rewriting it here is the only way to test aging
// buckets deterministically, same pattern analytics.test.js already
// uses (via its own runAsync) for date-dependent assertions.
const setSentDaysAgo = (id, daysAgo) => {

  const sentAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

  return runAsync(`UPDATE quotes SET sent_at = ? WHERE id = ?`, [sentAt, id]);

};


describe("Accounts receivable aging", () => {

  test("a fresh business has no outstanding invoices", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ArAgingFresh");

    const res = await request(app)
      .get("/api/analytics/ar-aging")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body.customers).toEqual([]);
    expect(res.body.totals.total_outstanding).toBe(0);

  });


  test("an invoice sent within the grace period is Current, not overdue", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ArAgingCurrent");
    const customerId = await createCustomer(authHeader);

    const invoiceId = await createInvoice(authHeader, customerId, 200);
    await sendInvoice(authHeader, invoiceId);
    await setSentDaysAgo(invoiceId, 1);

    const res = await request(app)
      .get("/api/analytics/ar-aging")
      .set("Authorization", authHeader);

    expect(res.body.customers).toHaveLength(1);
    expect(res.body.customers[0].total_outstanding).toBe(200);
    expect(res.body.customers[0].buckets.current).toBe(200);
    expect(res.body.customers[0].invoices[0].bucket).toBe("current");

  });


  test.each([
    [10, "days_1_30"],
    [45, "days_31_60"],
    [75, "days_61_90"],
    [120, "days_90_plus"]
  ])("an invoice sent %i days ago lands in bucket %s", async (daysAgo, expectedBucket) => {

    const { authHeader } = await createBusinessAndUser(app, `ArAgingBucket${daysAgo}`);
    const customerId = await createCustomer(authHeader);

    const invoiceId = await createInvoice(authHeader, customerId, 300);
    await sendInvoice(authHeader, invoiceId);
    await setSentDaysAgo(invoiceId, daysAgo);

    const res = await request(app)
      .get("/api/analytics/ar-aging")
      .set("Authorization", authHeader);

    expect(res.body.customers[0].invoices[0].bucket).toBe(expectedBucket);
    expect(res.body.customers[0].buckets[expectedBucket]).toBe(300);

  });


  test("a fully-paid invoice never shows up as outstanding", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ArAgingFullyPaid");
    const customerId = await createCustomer(authHeader);

    const invoiceId = await createInvoice(authHeader, customerId, 150);
    await sendInvoice(authHeader, invoiceId);
    await setSentDaysAgo(invoiceId, 20);

    await request(app)
      .post(`/api/quotes/${invoiceId}/payments`)
      .set("Authorization", authHeader)
      .send({ amount: 150, method: "cash" });

    const res = await request(app)
      .get("/api/analytics/ar-aging")
      .set("Authorization", authHeader);

    expect(res.body.customers).toEqual([]);

  });


  test("a partially-paid invoice shows only the remaining balance", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ArAgingPartial");
    const customerId = await createCustomer(authHeader);

    const invoiceId = await createInvoice(authHeader, customerId, 500);
    await sendInvoice(authHeader, invoiceId);
    await setSentDaysAgo(invoiceId, 10);

    await request(app)
      .post(`/api/quotes/${invoiceId}/payments`)
      .set("Authorization", authHeader)
      .send({ amount: 200, method: "check" });

    const res = await request(app)
      .get("/api/analytics/ar-aging")
      .set("Authorization", authHeader);

    expect(res.body.customers[0].total_outstanding).toBe(300);
    expect(res.body.customers[0].invoices[0].balance_due).toBe(300);

  });


  test("a draft invoice (never sent) and a quote (not an invoice) are both excluded", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ArAgingExcluded");
    const customerId = await createCustomer(authHeader);

    // Never sent.
    await createInvoice(authHeader, customerId, 400);

    // A quote, not an invoice - not "accounts receivable" yet.
    await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, type: "quote", items: [{ description: "Estimate", quantity: 1, unit_price: 600 }] });

    const res = await request(app)
      .get("/api/analytics/ar-aging")
      .set("Authorization", authHeader);

    expect(res.body.customers).toEqual([]);

  });


  test("multiple outstanding invoices for the same customer aggregate into one entry", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ArAgingAggregate");
    const customerId = await createCustomer(authHeader, "Aggregate Customer");

    const invoiceOne = await createInvoice(authHeader, customerId, 100);
    await sendInvoice(authHeader, invoiceOne);
    await setSentDaysAgo(invoiceOne, 1);

    const invoiceTwo = await createInvoice(authHeader, customerId, 250);
    await sendInvoice(authHeader, invoiceTwo);
    await setSentDaysAgo(invoiceTwo, 45);

    const res = await request(app)
      .get("/api/analytics/ar-aging")
      .set("Authorization", authHeader);

    expect(res.body.customers).toHaveLength(1);
    expect(res.body.customers[0].customer_name).toBe("Aggregate Customer");
    expect(res.body.customers[0].total_outstanding).toBe(350);
    expect(res.body.customers[0].buckets.current).toBe(100);
    expect(res.body.customers[0].buckets.days_31_60).toBe(250);
    expect(res.body.customers[0].invoices).toHaveLength(2);

    expect(res.body.totals.total_outstanding).toBe(350);

  });


  test("results are scoped to the right business", async () => {

    const bizA = await createBusinessAndUser(app, "ArAgingIsolationA");
    const bizB = await createBusinessAndUser(app, "ArAgingIsolationB");

    const customerId = await createCustomer(bizA.authHeader);
    const invoiceId = await createInvoice(bizA.authHeader, customerId, 999);
    await sendInvoice(bizA.authHeader, invoiceId);
    await setSentDaysAgo(invoiceId, 5);

    const res = await request(app)
      .get("/api/analytics/ar-aging")
      .set("Authorization", bizB.authHeader);

    expect(res.body.customers).toEqual([]);

  });

});
