const request = require("supertest");
const app = require("../server");
const db = require("../../database/db");
const { createBusinessAndUser } = require("./setup/helpers");


const getAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {

    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));

  });

};


const createCustomer = async (authHeader, name) => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name });

  return res.body.id;

};


const createQuote = async (authHeader, customerId) => {

  const res = await request(app)
    .post("/api/quotes")
    .set("Authorization", authHeader)
    .send({
      customer_id: customerId,
      items: [{ description: "Roof replacement", quantity: 1, unit_price: 5000 }]
    });

  return res.body.id;

};


describe("Job costing: quote expenses", () => {

  test("adding expenses shows up on the quote with a running total and a computed margin", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ExpenseFlow");
    const customerId = await createCustomer(authHeader, "Expense Customer");
    const quoteId = await createQuote(authHeader, customerId);

    const materials = await request(app)
      .post(`/api/quotes/${quoteId}/expenses`)
      .set("Authorization", authHeader)
      .send({ description: "Shingles and underlayment", amount: 1200 });

    expect(materials.status).toBe(201);
    expect(materials.body.description).toBe("Shingles and underlayment");
    expect(materials.body.amount).toBe(1200);

    await request(app)
      .post(`/api/quotes/${quoteId}/expenses`)
      .set("Authorization", authHeader)
      .send({ description: "Subcontractor labor", amount: 800 });

    const detail = await request(app)
      .get(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader);

    expect(detail.body.expenses).toHaveLength(2);
    expect(detail.body.expense_total).toBe(2000);
    // Total is 5000 (1 x 5000 line item), so margin = 5000 - 2000 = 3000.
    expect(detail.body.total).toBe(5000);
    expect(detail.body.margin).toBe(3000);

  });


  test("a quote with no expenses has a zero expense_total and margin equal to its total", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ExpenseNone");
    const customerId = await createCustomer(authHeader, "No Expense Customer");
    const quoteId = await createQuote(authHeader, customerId);

    const detail = await request(app)
      .get(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader);

    expect(detail.body.expenses).toEqual([]);
    expect(detail.body.expense_total).toBe(0);
    expect(detail.body.margin).toBe(detail.body.total);

  });


  test("a blank description or a negative amount is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ExpenseValidation");
    const customerId = await createCustomer(authHeader, "Validation Customer");
    const quoteId = await createQuote(authHeader, customerId);

    const blankDescription = await request(app)
      .post(`/api/quotes/${quoteId}/expenses`)
      .set("Authorization", authHeader)
      .send({ description: "   ", amount: 100 });

    expect(blankDescription.status).toBe(400);

    const negativeAmount = await request(app)
      .post(`/api/quotes/${quoteId}/expenses`)
      .set("Authorization", authHeader)
      .send({ description: "Paint", amount: -50 });

    expect(negativeAmount.status).toBe(400);

  });


  test("deleting an expense removes it and recalculates the margin", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ExpenseDelete");
    const customerId = await createCustomer(authHeader, "Delete Customer");
    const quoteId = await createQuote(authHeader, customerId);

    const created = await request(app)
      .post(`/api/quotes/${quoteId}/expenses`)
      .set("Authorization", authHeader)
      .send({ description: "Dumpster rental", amount: 300 });

    const afterAdd = await request(app)
      .get(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader);

    expect(afterAdd.body.expense_total).toBe(300);

    const deleted = await request(app)
      .delete(`/api/quotes/${quoteId}/expenses/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(deleted.status).toBe(200);

    const afterDelete = await request(app)
      .get(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader);

    expect(afterDelete.body.expenses).toEqual([]);
    expect(afterDelete.body.expense_total).toBe(0);

  });


  test("a business can't add or delete expenses on another business's quote", async () => {

    const bizA = await createBusinessAndUser(app, "ExpenseTenantA");
    const bizB = await createBusinessAndUser(app, "ExpenseTenantB");

    const customerId = await createCustomer(bizA.authHeader, "Tenant Customer");
    const quoteId = await createQuote(bizA.authHeader, customerId);

    const addAttempt = await request(app)
      .post(`/api/quotes/${quoteId}/expenses`)
      .set("Authorization", bizB.authHeader)
      .send({ description: "Should not work", amount: 100 });

    expect(addAttempt.status).toBe(404);

    const created = await request(app)
      .post(`/api/quotes/${quoteId}/expenses`)
      .set("Authorization", bizA.authHeader)
      .send({ description: "Real expense", amount: 100 });

    const deleteAttempt = await request(app)
      .delete(`/api/quotes/${quoteId}/expenses/${created.body.id}`)
      .set("Authorization", bizB.authHeader);

    expect(deleteAttempt.status).toBe(404);

  });


  test("deleting a quote deletes its expenses too, leaving no orphan rows", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ExpenseOrphan");
    const customerId = await createCustomer(authHeader, "Orphan Customer");
    const quoteId = await createQuote(authHeader, customerId);

    const created = await request(app)
      .post(`/api/quotes/${quoteId}/expenses`)
      .set("Authorization", authHeader)
      .send({ description: "Will be orphaned if not cleaned up", amount: 50 });

    await request(app)
      .delete(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader);

    const orphan = await getAsync("SELECT * FROM quote_expenses WHERE id = ?", [created.body.id]);
    expect(orphan).toBeUndefined();

  });

});
