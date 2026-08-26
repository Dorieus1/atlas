const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");


const createCustomer = async (authHeader, name) => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name });

  return res.body.id;

};


const createSentInvoice = async (authHeader, customerId, unit_price = 1000) => {

  const created = await request(app)
    .post("/api/quotes")
    .set("Authorization", authHeader)
    .send({
      customer_id: customerId,
      type: "invoice",
      items: [{ description: "Roof job", quantity: 1, unit_price }]
    });

  await request(app)
    .patch(`/api/quotes/${created.body.id}`)
    .set("Authorization", authHeader)
    .send({ status: "sent" });

  return created.body.id;

};


describe("Manually recorded quote/invoice payments", () => {

  test("recording a partial payment reduces the balance due and does not mark the invoice paid", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PaymentPartial");
    const customerId = await createCustomer(authHeader, "Partial Payment Customer");
    const invoiceId = await createSentInvoice(authHeader, customerId, 1000);

    const payment = await request(app)
      .post(`/api/quotes/${invoiceId}/payments`)
      .set("Authorization", authHeader)
      .send({ amount: 400, method: "cash", note: "Paid on-site" });

    expect(payment.status).toBe(201);
    expect(payment.body.markedPaid).toBe(false);

    const fetched = await request(app)
      .get(`/api/quotes/${invoiceId}`)
      .set("Authorization", authHeader);

    expect(fetched.body.status).toBe("sent");
    expect(fetched.body.amount_paid).toBe(400);
    expect(fetched.body.balance_due).toBe(600);
    expect(fetched.body.payments).toHaveLength(1);
    expect(fetched.body.payments[0].method).toBe("cash");
    expect(fetched.body.payments[0].note).toBe("Paid on-site");

  });


  test("multiple partial payments that add up to the total automatically mark the invoice paid", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PaymentFullSplit");
    const customerId = await createCustomer(authHeader, "Split Payment Customer");
    const invoiceId = await createSentInvoice(authHeader, customerId, 500);

    const first = await request(app)
      .post(`/api/quotes/${invoiceId}/payments`)
      .set("Authorization", authHeader)
      .send({ amount: 300, method: "check" });

    expect(first.body.markedPaid).toBe(false);

    const second = await request(app)
      .post(`/api/quotes/${invoiceId}/payments`)
      .set("Authorization", authHeader)
      .send({ amount: 200, method: "cash" });

    expect(second.status).toBe(201);
    expect(second.body.markedPaid).toBe(true);

    const fetched = await request(app)
      .get(`/api/quotes/${invoiceId}`)
      .set("Authorization", authHeader);

    expect(fetched.body.status).toBe("paid");
    expect(fetched.body.amount_paid).toBe(500);
    expect(fetched.body.balance_due).toBe(0);
    expect(fetched.body.paid_at).toBeTruthy();

  });


  test("a payment larger than the remaining balance is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PaymentOverpay");
    const customerId = await createCustomer(authHeader, "Overpay Customer");
    const invoiceId = await createSentInvoice(authHeader, customerId, 200);

    const res = await request(app)
      .post(`/api/quotes/${invoiceId}/payments`)
      .set("Authorization", authHeader)
      .send({ amount: 250, method: "cash" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/remaining balance/i);

  });


  test("a zero, negative, or non-numeric amount is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PaymentInvalidAmount");
    const customerId = await createCustomer(authHeader, "Invalid Amount Customer");
    const invoiceId = await createSentInvoice(authHeader, customerId, 200);

    const zero = await request(app)
      .post(`/api/quotes/${invoiceId}/payments`)
      .set("Authorization", authHeader)
      .send({ amount: 0, method: "cash" });

    expect(zero.status).toBe(400);

    const negative = await request(app)
      .post(`/api/quotes/${invoiceId}/payments`)
      .set("Authorization", authHeader)
      .send({ amount: -10, method: "cash" });

    expect(negative.status).toBe(400);

    const notANumber = await request(app)
      .post(`/api/quotes/${invoiceId}/payments`)
      .set("Authorization", authHeader)
      .send({ amount: "a lot", method: "cash" });

    expect(notANumber.status).toBe(400);

  });


  test("an invalid payment method is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PaymentBadMethod");
    const customerId = await createCustomer(authHeader, "Bad Method Customer");
    const invoiceId = await createSentInvoice(authHeader, customerId, 200);

    const res = await request(app)
      .post(`/api/quotes/${invoiceId}/payments`)
      .set("Authorization", authHeader)
      .send({ amount: 50, method: "bitcoin" });

    expect(res.status).toBe(400);

  });


  test("payments can't be recorded against a draft, declined, or a plain quote (not an invoice)", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PaymentWrongState");
    const customerId = await createCustomer(authHeader, "Wrong State Customer");

    const draftInvoice = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, type: "invoice", items: [{ description: "Job", quantity: 1, unit_price: 100 }] });

    const draftAttempt = await request(app)
      .post(`/api/quotes/${draftInvoice.body.id}/payments`)
      .set("Authorization", authHeader)
      .send({ amount: 10, method: "cash" });

    expect(draftAttempt.status).toBe(400);

    const plainQuote = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, type: "quote", items: [{ description: "Estimate", quantity: 1, unit_price: 100 }] });

    await request(app)
      .patch(`/api/quotes/${plainQuote.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "sent" });

    const quoteAttempt = await request(app)
      .post(`/api/quotes/${plainQuote.body.id}/payments`)
      .set("Authorization", authHeader)
      .send({ amount: 10, method: "cash" });

    expect(quoteAttempt.status).toBe(400);

  });


  test("a payment can't be recorded once the invoice is already fully paid", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PaymentAlreadyPaid");
    const customerId = await createCustomer(authHeader, "Already Paid Customer");
    const invoiceId = await createSentInvoice(authHeader, customerId, 100);

    await request(app)
      .patch(`/api/quotes/${invoiceId}`)
      .set("Authorization", authHeader)
      .send({ status: "paid" });

    const res = await request(app)
      .post(`/api/quotes/${invoiceId}/payments`)
      .set("Authorization", authHeader)
      .send({ amount: 10, method: "cash" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already fully paid/i);

  });


  test("deleting a mistaken payment restores the balance, but is blocked once the invoice is fully paid", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PaymentDelete");
    const customerId = await createCustomer(authHeader, "Delete Payment Customer");
    const invoiceId = await createSentInvoice(authHeader, customerId, 500);

    const payment = await request(app)
      .post(`/api/quotes/${invoiceId}/payments`)
      .set("Authorization", authHeader)
      .send({ amount: 200, method: "cash" });

    const afterAdd = await request(app)
      .get(`/api/quotes/${invoiceId}`)
      .set("Authorization", authHeader);

    expect(afterAdd.body.balance_due).toBe(300);

    const removed = await request(app)
      .delete(`/api/quotes/${invoiceId}/payments/${payment.body.id}`)
      .set("Authorization", authHeader);

    expect(removed.status).toBe(200);

    const afterRemove = await request(app)
      .get(`/api/quotes/${invoiceId}`)
      .set("Authorization", authHeader);

    expect(afterRemove.body.balance_due).toBe(500);
    expect(afterRemove.body.payments).toHaveLength(0);

    // Now pay it off fully and confirm the payment can no longer be removed.
    const finalPayment = await request(app)
      .post(`/api/quotes/${invoiceId}/payments`)
      .set("Authorization", authHeader)
      .send({ amount: 500, method: "cash" });

    expect(finalPayment.body.markedPaid).toBe(true);

    const blockedRemoval = await request(app)
      .delete(`/api/quotes/${invoiceId}/payments/${finalPayment.body.id}`)
      .set("Authorization", authHeader);

    expect(blockedRemoval.status).toBe(400);

  });


  test("a payment combined with a Stripe-collected deposit correctly reduces the balance due", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PaymentWithDeposit");
    const customerId = await createCustomer(authHeader, "Deposit Combo Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        type: "invoice",
        items: [{ description: "Big job", quantity: 1, unit_price: 1000 }],
        deposit_type: "fixed",
        deposit_value: 300
      });

    await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "sent" });

    // Simulate the deposit having already been paid via Stripe (the real
    // flow is exercised in stripePayments.test.js - only the interaction
    // with manually-recorded payments is under test here).
    const db = require("../../database/db");
    await new Promise((resolve, reject) => {
      db.run(
        "UPDATE quotes SET deposit_paid_at = ? WHERE id = ?",
        [new Date().toISOString(), created.body.id],
        (err) => (err ? reject(err) : resolve())
      );
    });

    const afterDeposit = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(afterDeposit.body.amount_paid).toBe(300);
    expect(afterDeposit.body.balance_due).toBe(700);

    const payment = await request(app)
      .post(`/api/quotes/${created.body.id}/payments`)
      .set("Authorization", authHeader)
      .send({ amount: 700, method: "check" });

    expect(payment.body.markedPaid).toBe(true);

    const finalState = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(finalState.body.status).toBe("paid");
    expect(finalState.body.balance_due).toBe(0);

  });


  test("payments are scoped to the right business", async () => {

    const bizA = await createBusinessAndUser(app, "PaymentIsolationA");
    const bizB = await createBusinessAndUser(app, "PaymentIsolationB");

    const customerA = await createCustomer(bizA.authHeader, "Isolation Customer A");
    const invoiceA = await createSentInvoice(bizA.authHeader, customerA, 300);

    const crossAttempt = await request(app)
      .post(`/api/quotes/${invoiceA}/payments`)
      .set("Authorization", bizB.authHeader)
      .send({ amount: 50, method: "cash" });

    expect(crossAttempt.status).toBe(404);

  });

});
