const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");


const createCustomer = async (authHeader, overrides = {}) => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name: "Statement Customer", ...overrides });

  return res.body.id;

};


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


const sendInvoice = (authHeader, id) =>
  request(app)
    .patch(`/api/quotes/${id}`)
    .set("Authorization", authHeader)
    .send({ status: "sent" });


describe("Customer statements", () => {

  test("a customer with no invoices gets an empty statement, not an error", async () => {

    const { authHeader } = await createBusinessAndUser(app, "StatementEmpty");
    const customerId = await createCustomer(authHeader);

    const res = await request(app)
      .get(`/api/customers/${customerId}/statement`)
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body.invoices).toEqual([]);
    expect(res.body.totals).toEqual({ total_billed: 0, total_paid: 0, total_balance_due: 0 });

  });


  test("a nonexistent customer 404s", async () => {

    const { authHeader } = await createBusinessAndUser(app, "StatementMissing");

    const res = await request(app)
      .get("/api/customers/does-not-exist/statement")
      .set("Authorization", authHeader);

    expect(res.status).toBe(404);

  });


  test("draft invoices and quotes are excluded; sent/accepted/paid invoices are included with correct totals", async () => {

    const { authHeader } = await createBusinessAndUser(app, "StatementFiltering");
    const customerId = await createCustomer(authHeader);

    // Never sent - excluded.
    await createInvoice(authHeader, customerId, 999);

    // A quote, not an invoice - excluded.
    await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, type: "quote", items: [{ description: "Estimate", quantity: 1, unit_price: 777 }] });

    // Sent, unpaid - included, full balance owed.
    const sentInvoiceId = await createInvoice(authHeader, customerId, 300);
    await sendInvoice(authHeader, sentInvoiceId);

    // Sent, then paid in full via a manual payment - included, zero balance.
    const paidInvoiceId = await createInvoice(authHeader, customerId, 150);
    await sendInvoice(authHeader, paidInvoiceId);
    await request(app)
      .post(`/api/quotes/${paidInvoiceId}/payments`)
      .set("Authorization", authHeader)
      .send({ amount: 150, method: "cash" });

    const res = await request(app)
      .get(`/api/customers/${customerId}/statement`)
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body.invoices).toHaveLength(2);

    const sentRow = res.body.invoices.find((invoice) => invoice.id === sentInvoiceId);
    const paidRow = res.body.invoices.find((invoice) => invoice.id === paidInvoiceId);

    expect(sentRow.total).toBe(300);
    expect(sentRow.balance_due).toBe(300);

    expect(paidRow.amount_paid).toBe(150);
    expect(paidRow.balance_due).toBe(0);

    expect(res.body.totals.total_billed).toBe(450);
    expect(res.body.totals.total_paid).toBe(150);
    expect(res.body.totals.total_balance_due).toBe(300);

  });


  test("invoices are ordered oldest first, like a running account history", async () => {

    const { authHeader } = await createBusinessAndUser(app, "StatementOrder");
    const customerId = await createCustomer(authHeader);

    const first = await createInvoice(authHeader, customerId, 100);
    await sendInvoice(authHeader, first);

    const second = await createInvoice(authHeader, customerId, 200);
    await sendInvoice(authHeader, second);

    const res = await request(app)
      .get(`/api/customers/${customerId}/statement`)
      .set("Authorization", authHeader);

    expect(res.body.invoices.map((invoice) => invoice.id)).toEqual([first, second]);

  });


  test("a business can't fetch another business's customer statement", async () => {

    const bizA = await createBusinessAndUser(app, "StatementScopeA");
    const bizB = await createBusinessAndUser(app, "StatementScopeB");

    const customerId = await createCustomer(bizA.authHeader);

    const res = await request(app)
      .get(`/api/customers/${customerId}/statement`)
      .set("Authorization", bizB.authHeader);

    expect(res.status).toBe(404);

  });


  test("the statement PDF downloads cleanly, both with and without invoices", async () => {

    const { authHeader } = await createBusinessAndUser(app, "StatementPdf");
    const customerId = await createCustomer(authHeader);

    const downloadPdf = () =>
      request(app)
        .get(`/api/customers/${customerId}/statement/pdf`)
        .set("Authorization", authHeader)
        .buffer(true)
        .parse((res, callback) => {
          res.setEncoding("binary");
          let data = "";
          res.on("data", (chunk) => { data += chunk; });
          res.on("end", () => callback(null, Buffer.from(data, "binary")));
        });

    const empty = await downloadPdf();

    expect(empty.status).toBe(200);
    expect(empty.headers["content-type"]).toBe("application/pdf");
    expect(empty.body.length).toBeGreaterThan(0);

    const invoiceId = await createInvoice(authHeader, customerId, 500);
    await sendInvoice(authHeader, invoiceId);

    const withInvoice = await downloadPdf();

    expect(withInvoice.status).toBe(200);
    expect(withInvoice.body.length).toBeGreaterThan(0);

  });

});
