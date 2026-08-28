const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");
const { signCustomerToken } = require("../services/portalAuthService");


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


const getBusinessId = async (authHeader) => {

  const res = await request(app)
    .get("/api/business")
    .set("Authorization", authHeader);

  return res.body[0].id;

};


const loginAsCustomer = async (slug, email) => {

  await request(app)
    .post(`/api/portal/${slug}/login`)
    .send({ email });

  const lastCall = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
  const body = JSON.parse(lastCall[1].body);
  const token = body.html.match(/token=([a-f0-9]+)/)[1];

  const verify = await request(app)
    .post(`/api/portal/${slug}/verify`)
    .send({ token });

  return `Bearer ${verify.body.token}`;

};


const connectAndOnboard = async (authHeader) => {

  await request(app)
    .post("/api/stripe/connect/start")
    .set("Authorization", authHeader);

  await request(app)
    .get("/api/stripe/connect/status")
    .set("Authorization", authHeader);

};


const ITEMS = [
  { description: "Roof inspection", quantity: 1, unit_price: 150 },
  { description: "Shingle replacement (per bundle)", quantity: 4, unit_price: 85 }
];

// 150 + 4*85 = 490
const SUBTOTAL = 490;

// A minimal valid 1x1 transparent PNG - accept() now requires a real
// signature image, not just a typed name, so every test that gets past
// name validation needs one of these on the request body.
const TEST_SIGNATURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";


beforeEach(() => {

  global.fetch.mockClear();

  global.__mockStripe.accountsCreate.mockClear();
  global.__mockStripe.accountsRetrieve.mockClear();
  global.__mockStripe.accountLinksCreate.mockClear();
  global.__mockStripe.checkoutSessionsCreate.mockClear();
  global.__mockStripe.couponsCreate.mockClear();
  global.__mockStripe.webhooksConstructEvent.mockReset();

  global.__mockStripe.accountsCreate.mockResolvedValue({ id: "acct_test123" });
  global.__mockStripe.accountsRetrieve.mockResolvedValue({ charges_enabled: true, details_submitted: true });
  global.__mockStripe.accountLinksCreate.mockResolvedValue({ url: "https://connect.stripe.com/setup/test" });
  global.__mockStripe.checkoutSessionsCreate.mockResolvedValue({ id: "cs_test_123", url: "https://checkout.stripe.com/pay/test" });
  global.__mockStripe.couponsCreate.mockResolvedValue({ id: "coupon_test_123" });

});


describe("Customer accept/decline", () => {

  test("a customer can accept a sent quote - name recorded, status/timestamp set, owner notified (an empty name is rejected first)", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AcceptFlow");
    const slug = await getSlug(authHeader);
    const customerId = await createCustomer(authHeader, "Accept Customer", "acceptflow@test.com");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS });

    await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "sent" });

    const customerAuthHeader = await loginAsCustomer(slug, "acceptflow@test.com");

    // A blank/missing name is a lightweight approval record with nothing
    // to attribute to - rejected before anything changes.
    const noName = await request(app)
      .post(`/api/portal/account/quotes/${created.body.id}/accept`)
      .set("Authorization", customerAuthHeader)
      .send({ type: "checkout.session.completed" });

    expect(noName.status).toBe(400);

    const stillSent = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(stillSent.body.status).toBe("sent");

    const accept = await request(app)
      .post(`/api/portal/account/quotes/${created.body.id}/accept`)
      .set("Authorization", customerAuthHeader)
      .send({ name: "Jane Homeowner", signature: TEST_SIGNATURE });

    expect(accept.status).toBe(200);

    const fetched = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched.body.status).toBe("accepted");
    expect(fetched.body.accepted_by_name).toBe("Jane Homeowner");
    expect(fetched.body.accepted_at).toBeTruthy();
    expect(fetched.body.declined_at).toBeFalsy();

    const notifications = await request(app)
      .get("/api/notifications")
      .set("Authorization", authHeader);

    expect(notifications.body.some((n) => n.type === "quote_accepted")).toBe(true);

  });


  test("a customer can decline a sent quote", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DeclineFlow");
    const slug = await getSlug(authHeader);
    const customerId = await createCustomer(authHeader, "Decline Customer", "declineflow@test.com");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS });

    await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "sent" });

    const customerAuthHeader = await loginAsCustomer(slug, "declineflow@test.com");

    const decline = await request(app)
      .post(`/api/portal/account/quotes/${created.body.id}/decline`)
      .set("Authorization", customerAuthHeader);

    expect(decline.status).toBe(200);

    const fetched = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched.body.status).toBe("declined");
    expect(fetched.body.declined_at).toBeTruthy();
    expect(fetched.body.accepted_at).toBeFalsy();

    const notifications = await request(app)
      .get("/api/notifications")
      .set("Authorization", authHeader);

    expect(notifications.body.some((n) => n.type === "quote_declined")).toBe(true);

  });


  test("a draft quote (never sent) can't be accepted or declined", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ActionDraft");
    const slug = await getSlug(authHeader);
    const customerId = await createCustomer(authHeader, "Draft Customer", "actiondraft@test.com");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS });

    const customerAuthHeader = await loginAsCustomer(slug, "actiondraft@test.com");

    const accept = await request(app)
      .post(`/api/portal/account/quotes/${created.body.id}/accept`)
      .set("Authorization", customerAuthHeader)
      .send({ name: "Someone", signature: TEST_SIGNATURE });

    expect(accept.status).toBe(400);

    const decline = await request(app)
      .post(`/api/portal/account/quotes/${created.body.id}/decline`)
      .set("Authorization", customerAuthHeader);

    expect(decline.status).toBe(400);

  });


  test("an already-accepted quote can't be accepted or declined again", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ActionAlreadyAccepted");
    const slug = await getSlug(authHeader);
    const customerId = await createCustomer(authHeader, "Already Accepted Customer", "actionaccepted@test.com");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS });

    await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "sent" });

    const customerAuthHeader = await loginAsCustomer(slug, "actionaccepted@test.com");

    await request(app)
      .post(`/api/portal/account/quotes/${created.body.id}/accept`)
      .set("Authorization", customerAuthHeader)
      .send({ name: "First Approval", signature: TEST_SIGNATURE });

    const secondAccept = await request(app)
      .post(`/api/portal/account/quotes/${created.body.id}/accept`)
      .set("Authorization", customerAuthHeader)
      .send({ name: "Second Approval", signature: TEST_SIGNATURE });

    expect(secondAccept.status).toBe(400);

    const decline = await request(app)
      .post(`/api/portal/account/quotes/${created.body.id}/decline`)
      .set("Authorization", customerAuthHeader);

    expect(decline.status).toBe(400);

    const fetched = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    // The first approval's name is still what's on record.
    expect(fetched.body.accepted_by_name).toBe("First Approval");

  });


  // Regression test for a real race a peer review caught: the sequential
  // test above (await one accept, then the other) always passed even
  // before the fix, since the second call's read ran after the first
  // had already committed. An ordinary double-tap on a slow connection
  // can genuinely overlap - both reading status='sent' before either
  // write lands - so this fires them concurrently instead. Before the
  // fix (updateQuoteFields with no status guard in its own WHERE
  // clause), both writes could succeed and the second would silently
  // clobber the first's signature and name.
  test("two truly concurrent accept attempts on the same quote don't both win", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ActionConcurrentAccept");
    const businessId = await getBusinessId(authHeader);
    const customerId = await createCustomer(authHeader, "Concurrent Accept Customer", "concurrentaccept@test.com");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS });

    await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "sent" });

    // Signed directly rather than through the real magic-link login flow
    // (loginAsCustomer) - this test's whole point is firing two requests
    // at once, not exercising login, and the portal's own /verify
    // endpoint is deliberately rate-limited (10/60s, shared by IP across
    // every test in this file) to guard against real brute-force login
    // attempts. Mirrors createBusinessAndUser's own reasoning in
    // setup/helpers.js for signing a business JWT directly instead of
    // hitting the real login endpoint for test fixture setup.
    const customerAuthHeader = `Bearer ${signCustomerToken(customerId, businessId)}`;

    const [first, second] = await Promise.all([

      request(app)
        .post(`/api/portal/account/quotes/${created.body.id}/accept`)
        .set("Authorization", customerAuthHeader)
        .send({ name: "Approver A", signature: TEST_SIGNATURE }),

      request(app)
        .post(`/api/portal/account/quotes/${created.body.id}/accept`)
        .set("Authorization", customerAuthHeader)
        .send({ name: "Approver B", signature: TEST_SIGNATURE })

    ]);

    const statuses = [first.status, second.status].sort();

    expect(statuses).toEqual([200, 400]);

    const fetched = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched.body.status).toBe("accepted");
    expect(["Approver A", "Approver B"]).toContain(fetched.body.accepted_by_name);

  });


  test("an already-paid invoice can't be accepted or declined", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ActionAlreadyPaid");
    const slug = await getSlug(authHeader);
    const customerId = await createCustomer(authHeader, "Already Paid Customer", "actionpaid@test.com");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, type: "invoice", items: ITEMS });

    await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "paid" });

    const customerAuthHeader = await loginAsCustomer(slug, "actionpaid@test.com");

    const accept = await request(app)
      .post(`/api/portal/account/quotes/${created.body.id}/accept`)
      .set("Authorization", customerAuthHeader)
      .send({ name: "Too Late", signature: TEST_SIGNATURE });

    expect(accept.status).toBe(400);

    const decline = await request(app)
      .post(`/api/portal/account/quotes/${created.body.id}/decline`)
      .set("Authorization", customerAuthHeader);

    expect(decline.status).toBe(400);

  });


  test("a customer can't accept or decline another business's quote", async () => {

    const bizA = await createBusinessAndUser(app, "CrossBizA");
    const bizB = await createBusinessAndUser(app, "CrossBizB");

    const slugA = await getSlug(bizA.authHeader);

    const customerA = await createCustomer(bizA.authHeader, "A Customer", "crossbiza@test.com");
    const customerB = await createCustomer(bizB.authHeader, "B Customer", "crossbizb@test.com");

    void customerA;

    const quoteB = await request(app)
      .post("/api/quotes")
      .set("Authorization", bizB.authHeader)
      .send({ customer_id: customerB, items: ITEMS });

    await request(app)
      .patch(`/api/quotes/${quoteB.body.id}`)
      .set("Authorization", bizB.authHeader)
      .send({ status: "sent" });

    const customerAAuthHeader = await loginAsCustomer(slugA, "crossbiza@test.com");

    const accept = await request(app)
      .post(`/api/portal/account/quotes/${quoteB.body.id}/accept`)
      .set("Authorization", customerAAuthHeader)
      .send({ name: "Sneaky", signature: TEST_SIGNATURE });

    expect(accept.status).toBe(404);

    const decline = await request(app)
      .post(`/api/portal/account/quotes/${quoteB.body.id}/decline`)
      .set("Authorization", customerAAuthHeader);

    expect(decline.status).toBe(404);

  });


  test("a customer can't accept or decline another customer's quote within the same business", async () => {

    const { authHeader } = await createBusinessAndUser(app, "CrossCustomer");
    const slug = await getSlug(authHeader);

    const customerA = await createCustomer(authHeader, "Customer A", "crosscustomera@test.com");
    const customerB = await createCustomer(authHeader, "Customer B", "crosscustomerb@test.com");

    void customerB;

    const quoteForA = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerA, items: ITEMS });

    await request(app)
      .patch(`/api/quotes/${quoteForA.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "sent" });

    const customerBAuthHeader = await loginAsCustomer(slug, "crosscustomerb@test.com");

    const accept = await request(app)
      .post(`/api/portal/account/quotes/${quoteForA.body.id}/accept`)
      .set("Authorization", customerBAuthHeader)
      .send({ name: "Wrong Person", signature: TEST_SIGNATURE });

    expect(accept.status).toBe(404);

  });

});


describe("Deposit validation", () => {

  test("a percent deposit over 100 is rejected at creation", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DepositOver100Create");
    const customerId = await createCustomer(authHeader, "Over 100 Deposit Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS, deposit_type: "percent", deposit_value: 101 });

    expect(created.status).toBe(400);

  });


  test("a fixed deposit larger than the total is rejected at creation", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DepositTooBigCreate");
    const customerId = await createCustomer(authHeader, "Too Big Deposit Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS, deposit_type: "fixed", deposit_value: SUBTOTAL + 1 });

    expect(created.status).toBe(400);
    expect(created.body.error).toMatch(/total/i);

  });


  test("a fixed deposit that fits the subtotal but not the discounted total is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DepositVsDiscountedTotal");
    const customerId = await createCustomer(authHeader, "Discount Deposit Customer");

    // Subtotal 490, discount 100 -> total 390. A $420 deposit fits under
    // the subtotal but not under the discounted total it's actually
    // supposed to apply against.
    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        items: ITEMS,
        discount_type: "fixed",
        discount_value: 100,
        deposit_type: "fixed",
        deposit_value: 420
      });

    expect(created.status).toBe(400);
    expect(created.body.error).toMatch(/total/i);

  });


  test("a deposit_type with no deposit_value (or vice versa) is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DepositMismatch");
    const customerId = await createCustomer(authHeader, "Mismatch Deposit Customer");

    const typeOnly = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS, deposit_type: "percent" });

    expect(typeOnly.status).toBe(400);

    const valueOnly = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS, deposit_value: 50 });

    expect(valueOnly.status).toBe(400);

  });


  test("a valid deposit is accepted and reflected on the quote", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DepositValid");
    const customerId = await createCustomer(authHeader, "Valid Deposit Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS, deposit_type: "percent", deposit_value: 20 });

    expect(created.status).toBe(201);

    const fetched = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched.body.deposit_type).toBe("percent");
    expect(fetched.body.deposit_value).toBe(20);
    expect(fetched.body.deposit_amount).toBe(SUBTOTAL * 0.2);
    expect(fetched.body.deposit_paid_at).toBeFalsy();

  });


  test("a fixed deposit larger than the total is rejected at update", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DepositTooBigUpdate");
    const customerId = await createCustomer(authHeader, "Too Big Update Deposit Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS });

    const update = await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ deposit_type: "fixed", deposit_value: SUBTOTAL + 1 });

    expect(update.status).toBe(400);
    expect(update.body.error).toMatch(/total/i);

    const fetched = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched.body.deposit_type).toBeNull();

  });


  test("shrinking line items so an existing fixed deposit no longer fits is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DepositShrinkItems");
    const customerId = await createCustomer(authHeader, "Shrink Deposit Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS, deposit_type: "fixed", deposit_value: 400 });

    expect(created.status).toBe(201);

    const shrink = await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ items: [{ description: "Small job", quantity: 1, unit_price: 50 }] });

    expect(shrink.status).toBe(400);
    expect(shrink.body.error).toMatch(/total/i);

  });


  test("a percent deposit over 100 is rejected at update", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DepositOver100Update");
    const customerId = await createCustomer(authHeader, "Over 100 Update Deposit Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS });

    const update = await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ deposit_type: "percent", deposit_value: 150 });

    expect(update.status).toBe(400);

  });

});


describe("Paying a deposit from the portal", () => {

  test("the Stripe Checkout Session for a deposit charges exactly the deposit amount, not the full total", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DepositCheckout");
    const slug = await getSlug(authHeader);

    await connectAndOnboard(authHeader);

    const customerId = await createCustomer(authHeader, "Deposit Checkout Customer", "depositcheckout@test.com");

    // Subtotal 490, 20% deposit -> deposit amount 98, nowhere near the
    // full total that createInvoiceCheckout would otherwise charge.
    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        type: "invoice",
        items: ITEMS,
        deposit_type: "percent",
        deposit_value: 20
      });

    await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "sent" });

    const customerAuthHeader = await loginAsCustomer(slug, "depositcheckout@test.com");

    await request(app)
      .post(`/api/portal/account/quotes/${created.body.id}/accept`)
      .set("Authorization", customerAuthHeader)
      .send({ name: "Deposit Payer", signature: TEST_SIGNATURE });

    const checkout = await request(app)
      .post(`/api/portal/account/quotes/${created.body.id}/deposit-checkout`)
      .set("Authorization", customerAuthHeader);

    expect(checkout.status).toBe(200);

    const sessionArgs = global.__mockStripe.checkoutSessionsCreate.mock.calls[0][0];

    // 490 * 0.2 = 98, in cents.
    expect(sessionArgs.line_items.length).toBe(1);
    expect(sessionArgs.line_items[0].price_data.unit_amount).toBe(9800);
    expect(sessionArgs.line_items[0].price_data.unit_amount).not.toBe(SUBTOTAL * 100);

    expect(sessionArgs.metadata).toEqual(
      expect.objectContaining({ quote_id: created.body.id, payment_type: "deposit" })
    );

  });


  test("a deposit can't be paid before the quote is accepted, and a quote with no deposit configured can't be paid at all", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DepositGuards");
    const slug = await getSlug(authHeader);

    await connectAndOnboard(authHeader);

    const customerId = await createCustomer(authHeader, "Guards Customer", "depositguards@test.com");

    // One login, two quotes under the same customer - keeps this file
    // under the portal's login rate limit (see loginAsCustomer usage
    // elsewhere in this file) while still covering both guards.
    const withDeposit = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS, deposit_type: "fixed", deposit_value: 50 });

    const withoutDeposit = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS });

    await request(app)
      .patch(`/api/quotes/${withDeposit.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "sent" });

    await request(app)
      .patch(`/api/quotes/${withoutDeposit.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "sent" });

    const customerAuthHeader = await loginAsCustomer(slug, "depositguards@test.com");

    // Still "sent", not yet accepted - a deposit before acceptance
    // doesn't make sense.
    const beforeAccept = await request(app)
      .post(`/api/portal/account/quotes/${withDeposit.body.id}/deposit-checkout`)
      .set("Authorization", customerAuthHeader);

    expect(beforeAccept.status).toBe(400);
    expect(global.__mockStripe.checkoutSessionsCreate).not.toHaveBeenCalled();

    // Accepted, but no deposit was ever configured on this one.
    await request(app)
      .post(`/api/portal/account/quotes/${withoutDeposit.body.id}/accept`)
      .set("Authorization", customerAuthHeader)
      .send({ name: "No Deposit Here", signature: TEST_SIGNATURE });

    const noDepositConfigured = await request(app)
      .post(`/api/portal/account/quotes/${withoutDeposit.body.id}/deposit-checkout`)
      .set("Authorization", customerAuthHeader);

    expect(noDepositConfigured.status).toBe(400);
    expect(global.__mockStripe.checkoutSessionsCreate).not.toHaveBeenCalled();

  });


  test("paying the full invoice after a deposit already covers it - partial deposit charges the remainder, a full deposit refuses to charge $0", async () => {

    const { authHeader } = await createBusinessAndUser(app, "RemainingBalance");
    const slug = await getSlug(authHeader);

    await connectAndOnboard(authHeader);

    const businessId = await getBusinessId(authHeader);

    // One login, two quotes under the same customer - keeps this file
    // under the portal's login rate limit, same reasoning as the
    // DepositGuards test above.
    const customerId = await createCustomer(authHeader, "Remaining Balance Customer", "remainingbalance@test.com");

    // Subtotal 490, 20% deposit -> deposit amount 98, remaining balance 392.
    const partial = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        type: "invoice",
        items: ITEMS,
        deposit_type: "percent",
        deposit_value: 20
      });

    // Subtotal 490, 100% deposit -> nothing left to pay afterward.
    const full = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        type: "invoice",
        items: ITEMS,
        deposit_type: "percent",
        deposit_value: 100
      });

    await request(app)
      .patch(`/api/quotes/${partial.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "sent" });

    await request(app)
      .patch(`/api/quotes/${full.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "sent" });

    const customerAuthHeader = await loginAsCustomer(slug, "remainingbalance@test.com");

    await request(app)
      .post(`/api/portal/account/quotes/${partial.body.id}/accept`)
      .set("Authorization", customerAuthHeader)
      .send({ name: "Remaining Balance Payer", signature: TEST_SIGNATURE });

    await request(app)
      .post(`/api/portal/account/quotes/${full.body.id}/accept`)
      .set("Authorization", customerAuthHeader)
      .send({ name: "Remaining Balance Payer", signature: TEST_SIGNATURE });

    // Pay both deposits, then simulate Stripe's webhook confirming each -
    // that's what actually sets deposit_paid_at, not the checkout call
    // itself.
    await request(app)
      .post(`/api/portal/account/quotes/${partial.body.id}/deposit-checkout`)
      .set("Authorization", customerAuthHeader);

    await request(app)
      .post(`/api/portal/account/quotes/${full.body.id}/deposit-checkout`)
      .set("Authorization", customerAuthHeader);

    for (const quoteId of [partial.body.id, full.body.id]) {

      global.__mockStripe.webhooksConstructEvent.mockReturnValue({
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { quote_id: quoteId, business_id: businessId, payment_type: "deposit" }
          }
        }
      });

      await request(app)
        .post("/api/stripe/webhook")
        .set("stripe-signature", "test_signature")
        .send({ type: "checkout.session.completed" });

    }

    global.__mockStripe.checkoutSessionsCreate.mockClear();

    // Partial deposit: the "full" invoice payment must charge the
    // remaining 392, never the original 490 total on top of the 98
    // already paid.
    const partialCheckout = await request(app)
      .post(`/api/portal/account/quotes/${partial.body.id}/checkout`)
      .set("Authorization", customerAuthHeader);

    expect(partialCheckout.status).toBe(200);

    const sessionArgs = global.__mockStripe.checkoutSessionsCreate.mock.calls[0][0];

    expect(sessionArgs.line_items.length).toBe(1);
    expect(sessionArgs.line_items[0].price_data.unit_amount).toBe(39200);
    expect(sessionArgs.line_items[0].price_data.unit_amount).not.toBe(SUBTOTAL * 100);

    global.__mockStripe.checkoutSessionsCreate.mockClear();

    // Full deposit: nothing left to pay, so the endpoint must refuse
    // rather than charge $0 (or the full total again).
    const fullCheckout = await request(app)
      .post(`/api/portal/account/quotes/${full.body.id}/checkout`)
      .set("Authorization", customerAuthHeader);

    expect(fullCheckout.status).toBe(400);
    expect(global.__mockStripe.checkoutSessionsCreate).not.toHaveBeenCalled();

  });


});


describe("Stripe webhook - deposit vs full payment", () => {

  test("payment_type: 'deposit' sets deposit_paid_at only, never status or paid_at", async () => {

    const { authHeader } = await createBusinessAndUser(app, "WebhookDeposit");

    const customerId = await createCustomer(authHeader, "Webhook Deposit Customer", "webhookdeposit@test.com");
    const businessId = await getBusinessId(authHeader);

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        type: "invoice",
        items: ITEMS,
        deposit_type: "fixed",
        deposit_value: 100
      });

    // Staff can move a quote straight to "accepted" without going
    // through the portal - the deposit-checkout precondition only cares
    // about the quote's current status, not how it got there.
    await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "accepted" });

    global.__mockStripe.webhooksConstructEvent.mockReturnValue({

      type: "checkout.session.completed",

      data: {
        object: {
          metadata: { quote_id: created.body.id, business_id: businessId, payment_type: "deposit" }
        }
      }

    });

    const webhook = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test_signature")
      .send({ type: "checkout.session.completed" });

    expect(webhook.status).toBe(200);

    const quote = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(quote.body.deposit_paid_at).toBeTruthy();
    expect(quote.body.status).toBe("accepted");
    expect(quote.body.paid_at).toBeFalsy();

    const notifications = await request(app)
      .get("/api/notifications")
      .set("Authorization", authHeader);

    expect(notifications.body.some((n) => n.type === "deposit_paid")).toBe(true);

  });


  // The regression check: an ordinary full invoice payment - metadata
  // now explicitly tagged payment_type: 'invoice' by createInvoiceCheckout -
  // must still land on status/paid_at exactly like before, and must NOT
  // touch deposit_paid_at.
  test("payment_type: 'invoice' still sets status 'paid' and paid_at, never deposit_paid_at", async () => {

    const { authHeader } = await createBusinessAndUser(app, "WebhookInvoiceRegression");

    await request(app)
      .put("/api/business")
      .set("Authorization", authHeader)
      .send({ name: "Whatever", review_link: "https://g.page/r/example/review" });

    const customerId = await createCustomer(authHeader, "Webhook Invoice Customer", "webhookinvoice@test.com");
    const businessId = await getBusinessId(authHeader);

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, type: "invoice", items: ITEMS });

    global.__mockStripe.webhooksConstructEvent.mockReturnValue({

      type: "checkout.session.completed",

      data: {
        object: {
          metadata: { quote_id: created.body.id, business_id: businessId, payment_type: "invoice" }
        }
      }

    });

    const webhook = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test_signature")
      .send({ type: "checkout.session.completed" });

    expect(webhook.status).toBe(200);

    const quote = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(quote.body.status).toBe("paid");
    expect(quote.body.paid_at).toBeTruthy();
    expect(quote.body.deposit_paid_at).toBeFalsy();

  });


  // Same regression, but for metadata with no payment_type field at all -
  // exactly the shape older/in-flight Checkout Sessions would carry.
  test("metadata with no payment_type field at all still falls through to the full-payment path", async () => {

    const { authHeader } = await createBusinessAndUser(app, "WebhookNoPaymentType");

    const customerId = await createCustomer(authHeader, "No Payment Type Customer", "nopaymenttype@test.com");
    const businessId = await getBusinessId(authHeader);

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, type: "invoice", items: ITEMS });

    global.__mockStripe.webhooksConstructEvent.mockReturnValue({

      type: "checkout.session.completed",

      data: {
        object: {
          metadata: { quote_id: created.body.id, business_id: businessId }
        }
      }

    });

    const webhook = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test_signature")
      .send({ type: "checkout.session.completed" });

    expect(webhook.status).toBe(200);

    const quote = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(quote.body.status).toBe("paid");
    expect(quote.body.paid_at).toBeTruthy();

  });

});


const getPdfBuffer = (req) =>

  req.buffer(true).parse((res, callback) => {
    res.setEncoding("binary");
    let data = "";
    res.on("data", (chunk) => { data += chunk; });
    res.on("end", () => callback(null, Buffer.from(data, "binary")));
  });


describe("Deposit info on the generated PDF", () => {

  test("a quote with an unpaid deposit renders without crashing", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DepositPdfUnpaid");
    const customerId = await createCustomer(authHeader, "PDF Deposit Customer", "pdfdeposit@test.com");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        type: "invoice",
        items: ITEMS,
        deposit_type: "fixed",
        deposit_value: 100
      });

    const pdf = await getPdfBuffer(
      request(app)
        .get(`/api/quotes/${created.body.id}/pdf`)
        .set("Authorization", authHeader)
    );

    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.body.slice(0, 4).toString()).toBe("%PDF");
    expect(pdf.body.length).toBeGreaterThan(500);

  });


  test("a quote with a paid deposit (and the resulting remaining-balance line) renders without crashing", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DepositPdfPaid");
    const customerId = await createCustomer(authHeader, "PDF Paid Deposit Customer", "pdfpaiddeposit@test.com");
    const businessId = await getBusinessId(authHeader);

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        type: "invoice",
        items: ITEMS,
        deposit_type: "percent",
        deposit_value: 25
      });

    global.__mockStripe.webhooksConstructEvent.mockReturnValue({

      type: "checkout.session.completed",

      data: {
        object: {
          metadata: { quote_id: created.body.id, business_id: businessId, payment_type: "deposit" }
        }
      }

    });

    await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test_signature")
      .send({ type: "checkout.session.completed" });

    const pdf = await getPdfBuffer(
      request(app)
        .get(`/api/quotes/${created.body.id}/pdf`)
        .set("Authorization", authHeader)
    );

    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.body.slice(0, 4).toString()).toBe("%PDF");
    expect(pdf.body.length).toBeGreaterThan(500);

  });

});


describe("Editing a quote once money has actually changed hands", () => {

  test("a fully paid invoice can't have its items, discount, or deposit edited", async () => {

    const { authHeader } = await createBusinessAndUser(app, "EditLockPaid");
    const customerId = await createCustomer(authHeader, "Edit Lock Customer", "editlockpaid@test.com");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, type: "invoice", items: ITEMS });

    await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "paid" });

    const attempt = await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ items: [{ description: "Different job", quantity: 1, unit_price: 99999 }] });

    expect(attempt.status).toBe(400);

    const unchanged = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(unchanged.body.total).toBe(SUBTOTAL);

    // Status/notes edits, which don't touch the actual amounts, are
    // still allowed on a paid invoice.
    const notesEdit = await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ notes: "Thanks for your business!" });

    expect(notesEdit.status).toBe(200);

  });


  test("a quote with an already-paid deposit can't have its items, discount, or deposit edited, even while still 'accepted' rather than 'paid'", async () => {

    const { authHeader } = await createBusinessAndUser(app, "EditLockDeposit");
    const customerId = await createCustomer(authHeader, "Deposit Lock Customer", "editlockdeposit@test.com");
    const businessId = await getBusinessId(authHeader);

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        type: "invoice",
        items: ITEMS,
        deposit_type: "fixed",
        deposit_value: 100
      });

    await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "accepted" });

    global.__mockStripe.webhooksConstructEvent.mockReturnValue({

      type: "checkout.session.completed",

      data: {
        object: {
          metadata: { quote_id: created.body.id, business_id: businessId, payment_type: "deposit" }
        }
      }

    });

    await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test_signature")
      .send({ type: "checkout.session.completed" });

    const attempt = await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ deposit_type: "fixed", deposit_value: 50 });

    expect(attempt.status).toBe(400);

    const unchanged = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(unchanged.body.deposit_value).toBe(100);

  });


  test("a merely 'sent' or 'accepted' quote with no deposit paid yet can still be freely edited", async () => {

    const { authHeader } = await createBusinessAndUser(app, "EditStillOpen");
    const customerId = await createCustomer(authHeader, "Open Edit Customer", "openedit@test.com");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, type: "invoice", items: ITEMS });

    await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "accepted" });

    const attempt = await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ items: [{ description: "Updated scope", quantity: 1, unit_price: 600 }] });

    expect(attempt.status).toBe(200);

    const updated = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(updated.body.total).toBe(600);

  });

});
