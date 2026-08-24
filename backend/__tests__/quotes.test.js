const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");

const createCustomer = async (app, authHeader, name) => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name });

  return res.body.id;

};

const VALID_ITEMS = [
  { description: "Roof inspection", quantity: 1, unit_price: 150 },
  { description: "Shingle replacement (per bundle)", quantity: 4, unit_price: 85 }
];

describe("Quotes and Invoices", () => {

  test("a quote requires a customer and at least one valid line item, and computes its total", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QuoteValidation");
    const customerId = await createCustomer(app, authHeader, "Quote Customer");

    const noCustomer = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ items: VALID_ITEMS });

    expect(noCustomer.status).toBe(400);

    const noItems = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: [] });

    expect(noItems.status).toBe(400);

    const badQuantity = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        items: [{ description: "Bad item", quantity: -1, unit_price: 10 }]
      });

    expect(badQuantity.status).toBe(400);

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: VALID_ITEMS });

    expect(created.status).toBe(201);

    const list = await request(app)
      .get("/api/quotes")
      .set("Authorization", authHeader);

    expect(list.body[0].total).toBe(150 + 4 * 85);
    expect(list.body[0].type).toBe("quote");
    expect(list.body[0].status).toBe("draft");

  });

  test("a quote cannot be created against another business's customer", async () => {

    const bizA = await createBusinessAndUser(app, "QuoteCrossA");
    const bizB = await createBusinessAndUser(app, "QuoteCrossB");

    const customerId = await createCustomer(app, bizA.authHeader, "A's Customer");

    const attempt = await request(app)
      .post("/api/quotes")
      .set("Authorization", bizB.authHeader)
      .send({ customer_id: customerId, items: VALID_ITEMS });

    expect(attempt.status).toBe(404);

  });

  test("fetching a single quote returns its line items, and is scoped to the right business", async () => {

    const bizA = await createBusinessAndUser(app, "QuoteDetailA");
    const bizB = await createBusinessAndUser(app, "QuoteDetailB");

    const customerId = await createCustomer(app, bizA.authHeader, "Detail Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", bizA.authHeader)
      .send({ customer_id: customerId, items: VALID_ITEMS });

    const quoteId = created.body.id;

    const ownFetch = await request(app)
      .get(`/api/quotes/${quoteId}`)
      .set("Authorization", bizA.authHeader);

    expect(ownFetch.status).toBe(200);
    expect(ownFetch.body.items.length).toBe(2);

    const crossFetch = await request(app)
      .get(`/api/quotes/${quoteId}`)
      .set("Authorization", bizB.authHeader);

    expect(crossFetch.status).toBe(404);

  });

  test("a quote can be converted to an invoice and marked paid, but not with an invalid status", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QuoteConvert");
    const customerId = await createCustomer(app, authHeader, "Convert Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: VALID_ITEMS });

    const quoteId = created.body.id;

    const badStatus = await request(app)
      .patch(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader)
      .send({ status: "not-a-real-status" });

    expect(badStatus.status).toBe(400);

    const convert = await request(app)
      .patch(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader)
      .send({ type: "invoice", status: "paid" });

    expect(convert.status).toBe(200);

    const fetched = await request(app)
      .get(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader);

    expect(fetched.body.type).toBe("invoice");
    expect(fetched.body.status).toBe("paid");

  });

  test("line items can be replaced, and the total updates to match", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QuoteReplaceItems");
    const customerId = await createCustomer(app, authHeader, "Replace Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: VALID_ITEMS });

    const quoteId = created.body.id;

    const replace = await request(app)
      .patch(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader)
      .send({ items: [{ description: "Simplified job", quantity: 1, unit_price: 500 }] });

    expect(replace.status).toBe(200);

    const fetched = await request(app)
      .get(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader);

    expect(fetched.body.total).toBe(500);
    expect(fetched.body.items.length).toBe(1);

  });

  test("deleting a quote works for the owning business, and is rejected for another", async () => {

    const bizA = await createBusinessAndUser(app, "QuoteDeleteA");
    const bizB = await createBusinessAndUser(app, "QuoteDeleteB");

    const customerId = await createCustomer(app, bizA.authHeader, "Delete Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", bizA.authHeader)
      .send({ customer_id: customerId, items: VALID_ITEMS });

    const quoteId = created.body.id;

    const bAttempt = await request(app)
      .delete(`/api/quotes/${quoteId}`)
      .set("Authorization", bizB.authHeader);

    expect(bAttempt.status).toBe(404);

    const ownDelete = await request(app)
      .delete(`/api/quotes/${quoteId}`)
      .set("Authorization", bizA.authHeader);

    expect(ownDelete.status).toBe(200);

    const list = await request(app)
      .get("/api/quotes")
      .set("Authorization", bizA.authHeader);

    expect(list.body.length).toBe(0);

  });

  test("a customer's quotes can be listed by customer_id, scoped to the right business", async () => {

    const bizA = await createBusinessAndUser(app, "QuoteListA");
    const bizB = await createBusinessAndUser(app, "QuoteListB");

    const customerId = await createCustomer(app, bizA.authHeader, "List Customer");

    await request(app)
      .post("/api/quotes")
      .set("Authorization", bizA.authHeader)
      .send({ customer_id: customerId, items: VALID_ITEMS });

    const ownList = await request(app)
      .get(`/api/quotes/customer/${customerId}`)
      .set("Authorization", bizA.authHeader);

    expect(ownList.status).toBe(200);
    expect(ownList.body.length).toBe(1);

    const crossList = await request(app)
      .get(`/api/quotes/customer/${customerId}`)
      .set("Authorization", bizB.authHeader);

    expect(crossList.status).toBe(404);

  });

  test("deleting a customer also removes their quotes and line items", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QuoteCustomerCascade");
    const customerId = await createCustomer(app, authHeader, "Cascade Customer");

    await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: VALID_ITEMS });

    await request(app)
      .delete(`/api/customers/${customerId}`)
      .set("Authorization", authHeader);

    const list = await request(app)
      .get("/api/quotes")
      .set("Authorization", authHeader);

    expect(list.body.length).toBe(0);

  });

});
