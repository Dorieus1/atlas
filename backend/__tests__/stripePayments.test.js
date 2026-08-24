const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");


const getSlug = async (authHeader) => {

  const res = await request(app)
    .get("/api/business")
    .set("Authorization", authHeader);

  return res.body[0].slug;

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


beforeEach(() => {

  global.fetch.mockClear();

  global.__mockStripe.accountsCreate.mockClear();
  global.__mockStripe.accountsRetrieve.mockClear();
  global.__mockStripe.accountLinksCreate.mockClear();
  global.__mockStripe.checkoutSessionsCreate.mockClear();
  global.__mockStripe.webhooksConstructEvent.mockReset();

  global.__mockStripe.accountsCreate.mockResolvedValue({ id: "acct_test123" });
  global.__mockStripe.accountsRetrieve.mockResolvedValue({ charges_enabled: true, details_submitted: true });
  global.__mockStripe.accountLinksCreate.mockResolvedValue({ url: "https://connect.stripe.com/setup/test" });
  global.__mockStripe.checkoutSessionsCreate.mockResolvedValue({ id: "cs_test_123", url: "https://checkout.stripe.com/pay/test" });

});


describe("Stripe Connect onboarding", () => {

  test("a fresh business isn't connected yet", async () => {

    const { authHeader } = await createBusinessAndUser(app, "StripeFresh");

    const status = await request(app)
      .get("/api/stripe/connect/status")
      .set("Authorization", authHeader);

    expect(status.status).toBe(200);
    expect(status.body.connected).toBe(false);
    expect(status.body.onboarded).toBe(false);

  });


  test("starting onboarding creates a connect account and returns a link", async () => {

    const { authHeader } = await createBusinessAndUser(app, "StripeStart");

    const start = await request(app)
      .post("/api/stripe/connect/start")
      .set("Authorization", authHeader);

    expect(start.status).toBe(200);
    expect(start.body.url).toBe("https://connect.stripe.com/setup/test");
    expect(global.__mockStripe.accountsCreate).toHaveBeenCalledTimes(1);

    const secondStart = await request(app)
      .post("/api/stripe/connect/start")
      .set("Authorization", authHeader);

    expect(secondStart.status).toBe(200);
    // Reuses the existing account instead of creating a second one.
    expect(global.__mockStripe.accountsCreate).toHaveBeenCalledTimes(1);

  });


  test("status reflects onboarded once Stripe reports the account is ready", async () => {

    const { authHeader } = await createBusinessAndUser(app, "StripeOnboarded");

    await request(app)
      .post("/api/stripe/connect/start")
      .set("Authorization", authHeader);

    const status = await request(app)
      .get("/api/stripe/connect/status")
      .set("Authorization", authHeader);

    expect(status.body.connected).toBe(true);
    expect(status.body.onboarded).toBe(true);

  });


  test("status reflects not-yet-onboarded while Stripe still needs more info", async () => {

    global.__mockStripe.accountsRetrieve.mockResolvedValue({ charges_enabled: false, details_submitted: false });

    const { authHeader } = await createBusinessAndUser(app, "StripeIncomplete");

    await request(app)
      .post("/api/stripe/connect/start")
      .set("Authorization", authHeader);

    const status = await request(app)
      .get("/api/stripe/connect/status")
      .set("Authorization", authHeader);

    expect(status.body.connected).toBe(true);
    expect(status.body.onboarded).toBe(false);

  });

});


describe("Paying an invoice from the portal", () => {

  test("checkout is refused if the business hasn't connected Stripe", async () => {

    const { authHeader } = await createBusinessAndUser(app, "CheckoutNotConnected");
    const slug = await getSlug(authHeader);

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Pay Customer", email: "paynotconnected@test.com" });

    const invoiceRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerRes.body.id, type: "invoice", items: [{ description: "Roof repair", quantity: 1, unit_price: 500 }] });

    const customerAuthHeader = await loginAsCustomer(slug, "paynotconnected@test.com");

    const checkout = await request(app)
      .post(`/api/portal/account/quotes/${invoiceRes.body.id}/checkout`)
      .set("Authorization", customerAuthHeader);

    expect(checkout.status).toBe(400);

  });


  test("a connected business's invoice can be paid, and the session id is saved on the quote", async () => {

    const { authHeader } = await createBusinessAndUser(app, "CheckoutValid");
    const slug = await getSlug(authHeader);

    await connectAndOnboard(authHeader);

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Pay Customer", email: "payvalid@test.com" });

    const invoiceRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerRes.body.id, type: "invoice", items: [{ description: "Roof repair", quantity: 1, unit_price: 500 }] });

    // A brand-new invoice defaults to "draft" - only one the owner has
    // actually sent is payable.
    await request(app)
      .patch(`/api/quotes/${invoiceRes.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "sent" });

    const customerAuthHeader = await loginAsCustomer(slug, "payvalid@test.com");

    const checkout = await request(app)
      .post(`/api/portal/account/quotes/${invoiceRes.body.id}/checkout`)
      .set("Authorization", customerAuthHeader);

    expect(checkout.status).toBe(200);
    expect(checkout.body.url).toBe("https://checkout.stripe.com/pay/test");

    // Confirms the charge is created *as* the connected account (a
    // direct charge), never touching a platform-owned balance.
    expect(global.__mockStripe.checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ stripeAccount: "acct_test123" })
    );

    const quote = await request(app)
      .get(`/api/quotes/${invoiceRes.body.id}`)
      .set("Authorization", authHeader);

    expect(quote.body.stripe_checkout_session_id).toBe("cs_test_123");

  });


  test("a draft invoice the owner hasn't sent yet can't be paid online", async () => {

    const { authHeader } = await createBusinessAndUser(app, "CheckoutDraft");
    const slug = await getSlug(authHeader);

    await connectAndOnboard(authHeader);

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Pay Customer", email: "paydraft@test.com" });

    const invoiceRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerRes.body.id, type: "invoice", items: [{ description: "Roof repair", quantity: 1, unit_price: 500 }] });

    const customerAuthHeader = await loginAsCustomer(slug, "paydraft@test.com");

    const checkout = await request(app)
      .post(`/api/portal/account/quotes/${invoiceRes.body.id}/checkout`)
      .set("Authorization", customerAuthHeader);

    expect(checkout.status).toBe(400);

  });


  test("a plain quote (not an invoice) can't be paid online", async () => {

    const { authHeader } = await createBusinessAndUser(app, "CheckoutWrongType");
    const slug = await getSlug(authHeader);

    await connectAndOnboard(authHeader);

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Pay Customer", email: "paywrongtype@test.com" });

    const quoteRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerRes.body.id, type: "quote", items: [{ description: "Estimate", quantity: 1, unit_price: 500 }] });

    const customerAuthHeader = await loginAsCustomer(slug, "paywrongtype@test.com");

    const checkout = await request(app)
      .post(`/api/portal/account/quotes/${quoteRes.body.id}/checkout`)
      .set("Authorization", customerAuthHeader);

    expect(checkout.status).toBe(400);

  });


  test("an already-paid invoice can't be checked out again", async () => {

    const { authHeader } = await createBusinessAndUser(app, "CheckoutAlreadyPaid");
    const slug = await getSlug(authHeader);

    await connectAndOnboard(authHeader);

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Pay Customer", email: "payalreadypaid@test.com" });

    const invoiceRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerRes.body.id, type: "invoice", items: [{ description: "Roof repair", quantity: 1, unit_price: 500 }] });

    await request(app)
      .patch(`/api/quotes/${invoiceRes.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "paid" });

    const customerAuthHeader = await loginAsCustomer(slug, "payalreadypaid@test.com");

    const checkout = await request(app)
      .post(`/api/portal/account/quotes/${invoiceRes.body.id}/checkout`)
      .set("Authorization", customerAuthHeader);

    expect(checkout.status).toBe(400);

  });


  test("a customer can't check out another business's invoice", async () => {

    const bizA = await createBusinessAndUser(app, "CheckoutCrossA");
    const bizB = await createBusinessAndUser(app, "CheckoutCrossB");

    const slugA = await getSlug(bizA.authHeader);

    await connectAndOnboard(bizA.authHeader);
    await connectAndOnboard(bizB.authHeader);

    const customerA = await request(app)
      .post("/api/customers")
      .set("Authorization", bizA.authHeader)
      .send({ name: "A Customer", email: "crosscheckouta@test.com" });

    const customerB = await request(app)
      .post("/api/customers")
      .set("Authorization", bizB.authHeader)
      .send({ name: "B Customer", email: "crosscheckoutb@test.com" });

    const invoiceB = await request(app)
      .post("/api/quotes")
      .set("Authorization", bizB.authHeader)
      .send({ customer_id: customerB.body.id, type: "invoice", items: [{ description: "Job", quantity: 1, unit_price: 200 }] });

    void customerA;

    const customerAAuthHeader = await loginAsCustomer(slugA, "crosscheckouta@test.com");

    // Customer A, logged in on business A's portal, tries to pay an
    // invoice that only exists under business B - checkout is scoped by
    // the customer's own business_id from their token, not anything the
    // client can pass in the URL.
    const checkout = await request(app)
      .post(`/api/portal/account/quotes/${invoiceB.body.id}/checkout`)
      .set("Authorization", customerAAuthHeader);

    expect(checkout.status).toBe(404);

  });

});


describe("Stripe webhook", () => {

  test("a request with a bad signature is rejected", async () => {

    global.__mockStripe.webhooksConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "bad_signature")
      .send({ type: "checkout.session.completed" });

    expect(res.status).toBe(400);

  });


  test("checkout.session.completed marks the invoice paid and fires the review-request automation", async () => {

    const { authHeader } = await createBusinessAndUser(app, "WebhookPaid");

    await request(app)
      .put("/api/business")
      .set("Authorization", authHeader)
      .send({ name: "Whatever", review_link: "https://g.page/r/example/review" });

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Webhook Customer", email: "webhookpaid@test.com" });

    const invoiceRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerRes.body.id, type: "invoice", items: [{ description: "Job", quantity: 1, unit_price: 300 }] });

    const business = await request(app)
      .get("/api/business")
      .set("Authorization", authHeader);

    const businessId = business.body[0].id;

    global.__mockStripe.webhooksConstructEvent.mockReturnValue({

      type: "checkout.session.completed",

      data: {
        object: {
          metadata: { quote_id: invoiceRes.body.id, business_id: businessId }
        }
      }

    });

    const webhook = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test_signature")
      .send({ type: "checkout.session.completed" });

    expect(webhook.status).toBe(200);

    const quote = await request(app)
      .get(`/api/quotes/${invoiceRes.body.id}`)
      .set("Authorization", authHeader);

    expect(quote.body.status).toBe("paid");
    expect(quote.body.paid_at).toBeTruthy();

    const reviewRequests = await request(app)
      .get(`/api/review-requests/customer/${customerRes.body.id}`)
      .set("Authorization", authHeader);

    expect(reviewRequests.body.length).toBe(1);

  });


  test("processing the same completed event twice doesn't send a duplicate review request", async () => {

    const { authHeader } = await createBusinessAndUser(app, "WebhookIdempotent");

    await request(app)
      .put("/api/business")
      .set("Authorization", authHeader)
      .send({ name: "Whatever", review_link: "https://g.page/r/example/review" });

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Idempotent Customer", email: "webhookidempotent@test.com" });

    const invoiceRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerRes.body.id, type: "invoice", items: [{ description: "Job", quantity: 1, unit_price: 300 }] });

    const business = await request(app)
      .get("/api/business")
      .set("Authorization", authHeader);

    const businessId = business.body[0].id;

    global.__mockStripe.webhooksConstructEvent.mockReturnValue({

      type: "checkout.session.completed",

      data: {
        object: {
          metadata: { quote_id: invoiceRes.body.id, business_id: businessId }
        }
      }

    });

    await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test_signature")
      .send({ type: "checkout.session.completed" });

    await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test_signature")
      .send({ type: "checkout.session.completed" });

    const reviewRequests = await request(app)
      .get(`/api/review-requests/customer/${customerRes.body.id}`)
      .set("Authorization", authHeader);

    expect(reviewRequests.body.length).toBe(1);

  });

});
