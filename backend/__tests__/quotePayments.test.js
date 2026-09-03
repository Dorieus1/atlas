const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");


const createCustomer = async (authHeader, name, email) => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name, email });

  return res.body.id;

};


const getSlug = async (authHeader) => {

  const res = await request(app)
    .get("/api/business")
    .set("Authorization", authHeader);

  return res.body[0].slug;

};


const connectAndOnboard = async (authHeader) => {

  await request(app)
    .post("/api/stripe/connect/start")
    .set("Authorization", authHeader);

  await request(app)
    .get("/api/stripe/connect/status")
    .set("Authorization", authHeader);

};


// X-Test-Client-Id (inert outside the test suite - see rateLimiter.js)
// gives each test's own simulated customer an independent rate-limit
// bucket on the shared per-file server, instead of every test in the
// file colliding on one bucket keyed by the loopback IP they all
// actually share.
const loginAsCustomer = async (slug, email) => {

  await request(app)
    .post(`/api/portal/${slug}/login`)
    .set("X-Test-Client-Id", email)
    .send({ email });

  const lastCall = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
  const body = JSON.parse(lastCall[1].body);
  const token = body.html.match(/token=([a-f0-9]+)/)[1];

  const verify = await request(app)
    .post(`/api/portal/${slug}/verify`)
    .set("X-Test-Client-Id", email)
    .send({ token });

  return `Bearer ${verify.body.token}`;

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


// Regression tests for two related real-money bugs both stemming from
// the same root cause: quote_payments/amount_paid/balance_due (this
// file's own subject, migration 045) is a newer source of truth than
// deposit_paid_at, and two pre-existing money-critical paths were never
// updated to consult it - a customer who'd already paid part of an
// invoice in cash could still be charged the full original total again
// through the portal, and an invoice with a manual payment recorded
// against it could still be edited to shrink the total below what was
// already paid.
describe("Manual payments interacting with the portal checkout and the edit lock", () => {

  test("the portal's Pay button charges only the remaining balance after a manual cash payment, and refuses to charge again once fully paid", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ManualPaymentCheckout");
    const slug = await getSlug(authHeader);

    await connectAndOnboard(authHeader);

    const customerId = await createCustomer(authHeader, "Manual Payment Customer", "manualpaymentcheckout@test.com");

    // Two $1000 invoices for the same customer - one login covers both,
    // matching this suite's own "scoped to the right business" style of
    // reusing setup rather than logging in per scenario.
    const partialId = await createSentInvoice(authHeader, customerId, 1000);
    const fullId = await createSentInvoice(authHeader, customerId, 1000);

    // $400 cash on the first - amount_paid 400, balance_due 600.
    await request(app)
      .post(`/api/quotes/${partialId}/payments`)
      .set("Authorization", authHeader)
      .send({ amount: 400, method: "cash" });

    // Full $1000 cash on the second - nothing left to charge.
    await request(app)
      .post(`/api/quotes/${fullId}/payments`)
      .set("Authorization", authHeader)
      .send({ amount: 1000, method: "cash" });

    const customerAuthHeader = await loginAsCustomer(slug, "manualpaymentcheckout@test.com");

    const partialCheckout = await request(app)
      .post(`/api/portal/account/quotes/${partialId}/checkout`)
      .set("Authorization", customerAuthHeader);

    expect(partialCheckout.status).toBe(200);

    const sessionArgs = global.__mockStripe.checkoutSessionsCreate.mock.calls[0][0];

    // (1000 - 400) * 100 = 60000 cents - must never be the full 100000.
    expect(sessionArgs.line_items.length).toBe(1);
    expect(sessionArgs.line_items[0].price_data.unit_amount).toBe(60000);
    expect(sessionArgs.line_items[0].price_data.unit_amount).not.toBe(100000);

    global.__mockStripe.checkoutSessionsCreate.mockClear();

    const fullCheckout = await request(app)
      .post(`/api/portal/account/quotes/${fullId}/checkout`)
      .set("Authorization", customerAuthHeader);

    expect(fullCheckout.status).toBe(400);
    expect(global.__mockStripe.checkoutSessionsCreate).not.toHaveBeenCalled();

  });


  test("a manual payment blocks editing items, same as a deposit or a full payment would", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PaymentEditLock");
    const customerId = await createCustomer(authHeader, "Edit Lock Customer");
    const invoiceId = await createSentInvoice(authHeader, customerId, 1000);

    await request(app)
      .post(`/api/quotes/${invoiceId}/payments`)
      .set("Authorization", authHeader)
      .send({ amount: 400, method: "cash" });

    // Shrinking the items to well under the $400 already paid must be
    // refused, not silently accepted with balance_due floored at 0.
    const edit = await request(app)
      .patch(`/api/quotes/${invoiceId}`)
      .set("Authorization", authHeader)
      .send({ items: [{ description: "Smaller job", quantity: 1, unit_price: 100 }] });

    expect(edit.status).toBe(400);

    const fetched = await request(app)
      .get(`/api/quotes/${invoiceId}`)
      .set("Authorization", authHeader);

    // Untouched - the original $1000 item is still there.
    expect(fetched.body.subtotal).toBe(1000);

  });

});
