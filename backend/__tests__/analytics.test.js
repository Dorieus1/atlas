const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");


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
