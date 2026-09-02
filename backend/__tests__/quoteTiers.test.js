const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");


const createCustomer = async (authHeader, name = "Tier Customer") => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name });

  return res.body.id;

};


// Same helpers portal.test.js uses for its own magic-link login flow.
const getSlug = async (authHeader) => {

  const res = await request(app)
    .get("/api/business")
    .set("Authorization", authHeader);

  return res.body[0].slug;

};

const extractToken = () => {

  const lastCall = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
  const body = JSON.parse(lastCall[1].body);
  const match = body.html.match(/token=([a-f0-9]+)/);

  return match ? match[1] : null;

};

const loginAsCustomer = async (slug, email) => {

  await request(app)
    .post(`/api/portal/${slug}/login`)
    .send({ email });

  const token = extractToken();

  const verify = await request(app)
    .post(`/api/portal/${slug}/verify`)
    .send({ token });

  return `Bearer ${verify.body.token}`;

};


// A minimal valid 1x1 transparent PNG, same fixture quoteSignature.test.js uses.
const TEST_SIGNATURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";


const GOOD_BETTER_BEST = {

  customer_id: null, // filled in per-test

  items: [{ description: "Site visit fee", quantity: 1, unit_price: 25 }],

  tiers: [
    { name: "Good", items: [{ description: "Basic repair", quantity: 1, unit_price: 200 }] },
    { name: "Better", is_recommended: true, items: [{ description: "Full repair", quantity: 1, unit_price: 400 }] },
    { name: "Best", items: [{ description: "Full replacement", quantity: 1, unit_price: 900 }] }
  ]

};


const createTieredQuote = async (authHeader, customer_id, overrides = {}) => {

  return request(app)
    .post("/api/quotes")
    .set("Authorization", authHeader)
    .send({ ...GOOD_BETTER_BEST, customer_id, ...overrides });

};


const sendQuoteStatus = (authHeader, id) =>
  request(app)
    .patch(`/api/quotes/${id}`)
    .set("Authorization", authHeader)
    .send({ status: "sent" });


describe("Good/Better/Best multi-option quotes", () => {

  test("creating a tiered quote returns each option with its own total (shared items folded in)", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TierCreate");
    const customerId = await createCustomer(authHeader);

    const created = await createTieredQuote(authHeader, customerId);

    expect(created.status).toBe(201);

    const fetched = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched.status).toBe(200);
    expect(fetched.body.tiers).toHaveLength(3);

    const [good, better, best] = fetched.body.tiers;

    // 25 shared + each tier's own item.
    expect(good.name).toBe("Good");
    expect(good.total).toBeCloseTo(225);
    expect(better.name).toBe("Better");
    expect(better.total).toBeCloseTo(425);
    expect(better.is_recommended).toBe(true);
    expect(best.name).toBe("Best");
    expect(best.total).toBeCloseTo(925);

    // No decision made yet - the headline total resolves to the
    // recommended tier ("Better"), not the first or the cheapest.
    expect(fetched.body.resolved_tier_id).toBe(better.id);
    expect(fetched.body.total).toBeCloseTo(425);
    expect(fetched.body.shared_items).toHaveLength(1);

  });


  test("with no recommended tier, the headline total resolves to the first tier", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TierNoRecommended");
    const customerId = await createCustomer(authHeader);

    const created = await createTieredQuote(authHeader, customerId, {
      tiers: GOOD_BETTER_BEST.tiers.map((tier) => ({ ...tier, is_recommended: false }))
    });

    const fetched = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched.body.resolved_tier_id).toBe(fetched.body.tiers[0].id);
    expect(fetched.body.total).toBeCloseTo(225);

  });


  test("fewer than 2 options, more than 5, duplicate names, and an empty option are all rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TierValidation");
    const customerId = await createCustomer(authHeader);

    const oneOption = await createTieredQuote(authHeader, customerId, {
      tiers: [GOOD_BETTER_BEST.tiers[0]]
    });

    expect(oneOption.status).toBe(400);

    const sixOptions = await createTieredQuote(authHeader, customerId, {
      tiers: [1, 2, 3, 4, 5, 6].map((n) => ({ name: `Option ${n}`, items: [{ description: "x", quantity: 1, unit_price: 10 }] }))
    });

    expect(sixOptions.status).toBe(400);

    const duplicateNames = await createTieredQuote(authHeader, customerId, {
      tiers: [
        { name: "Good", items: [{ description: "x", quantity: 1, unit_price: 10 }] },
        { name: "good", items: [{ description: "y", quantity: 1, unit_price: 20 }] }
      ]
    });

    expect(duplicateNames.status).toBe(400);

    const emptyOption = await createTieredQuote(authHeader, customerId, {
      items: [],
      tiers: [
        { name: "Good", items: [] },
        { name: "Best", items: [{ description: "y", quantity: 1, unit_price: 20 }] }
      ]
    });

    expect(emptyOption.status).toBe(400);

  });


  test("a tier with no items of its own is fine as long as a shared item exists", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TierSharedOnly");
    const customerId = await createCustomer(authHeader);

    const created = await createTieredQuote(authHeader, customerId, {
      items: [{ description: "Flat call-out fee", quantity: 1, unit_price: 50 }],
      tiers: [
        { name: "Good", items: [] },
        { name: "Best", items: [{ description: "Upgrade", quantity: 1, unit_price: 100 }] }
      ]
    });

    expect(created.status).toBe(201);

  });


  test("the quotes list shows the resolved headline total for a tiered quote, matching the single-GET view", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TierListView");
    const customerId = await createCustomer(authHeader);

    const created = await createTieredQuote(authHeader, customerId);

    const single = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    const list = await request(app)
      .get("/api/quotes")
      .set("Authorization", authHeader);

    const row = list.body.find((q) => q.id === created.body.id);

    expect(row.total).toBeCloseTo(single.body.total);
    expect(row.subtotal).toBeCloseTo(single.body.subtotal);

  });


  test("signing on-site requires a tier_id, and rejects one that doesn't belong to this quote", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TierSignRequired");
    const customerId = await createCustomer(authHeader);

    const created = await createTieredQuote(authHeader, customerId);
    await sendQuoteStatus(authHeader, created.body.id);

    const noTier = await request(app)
      .post(`/api/quotes/${created.body.id}/sign`)
      .set("Authorization", authHeader)
      .send({ name: "Someone", signature: TEST_SIGNATURE });

    expect(noTier.status).toBe(400);

    const fakeTier = await request(app)
      .post(`/api/quotes/${created.body.id}/sign`)
      .set("Authorization", authHeader)
      .send({ name: "Someone", signature: TEST_SIGNATURE, tier_id: "not-a-real-tier-id" });

    expect(fakeTier.status).toBe(400);

    const stillSent = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(stillSent.body.status).toBe("sent");

  });


  test("signing on-site with a real tier_id accepts the quote and locks in that tier's total", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TierSignValid");
    const customerId = await createCustomer(authHeader);

    const created = await createTieredQuote(authHeader, customerId);
    await sendQuoteStatus(authHeader, created.body.id);

    const beforeSign = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    const goodTierId = beforeSign.body.tiers.find((t) => t.name === "Good").id;

    const signed = await request(app)
      .post(`/api/quotes/${created.body.id}/sign`)
      .set("Authorization", authHeader)
      .send({ name: "Real Signer", signature: TEST_SIGNATURE, tier_id: goodTierId });

    expect(signed.status).toBe(200);

    const afterSign = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(afterSign.body.status).toBe("accepted");
    expect(afterSign.body.accepted_tier_id).toBe(goodTierId);
    // Locked to "Good" (225), not "Better" (the recommended one it would
    // have resolved to before a decision was made).
    expect(afterSign.body.total).toBeCloseTo(225);
    expect(afterSign.body.resolved_tier_id).toBe(goodTierId);

  });


  test("a plain (non-tiered) quote's accept flow is unaffected by an extraneous tier_id", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TierIgnoredOnPlain");
    const customerId = await createCustomer(authHeader);

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: [{ description: "Plain job", quantity: 1, unit_price: 100 }] });

    await sendQuoteStatus(authHeader, created.body.id);

    const signed = await request(app)
      .post(`/api/quotes/${created.body.id}/sign`)
      .set("Authorization", authHeader)
      .send({ name: "Someone", signature: TEST_SIGNATURE, tier_id: "irrelevant-value" });

    expect(signed.status).toBe(200);

  });


  test("a fixed discount valid for the cheapest option is accepted even though it would exceed a pricier one alone", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TierDiscountCheapest");
    const customerId = await createCustomer(authHeader);

    // Good totals 225 (25 shared + 200) - a $200 fixed discount fits
    // that, and is obviously still fine against Better (425) and Best (925).
    const created = await createTieredQuote(authHeader, customerId, {
      discount_type: "fixed",
      discount_value: 200
    });

    expect(created.status).toBe(201);

  });


  test("a fixed discount that exceeds even the cheapest option's subtotal is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TierDiscountTooBig");
    const customerId = await createCustomer(authHeader);

    // Good's subtotal is only 225 - a $300 fixed discount would make it
    // negative, even though it's perfectly fine against Best (925).
    const created = await createTieredQuote(authHeader, customerId, {
      discount_type: "fixed",
      discount_value: 300
    });

    expect(created.status).toBe(400);

  });


  test("editing an already-tiered quote's options via PATCH tiers replaces them", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TierEdit");
    const customerId = await createCustomer(authHeader);

    const created = await createTieredQuote(authHeader, customerId);

    const edited = await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({
        items: [],
        tiers: [
          { name: "Standard", items: [{ description: "Standard job", quantity: 1, unit_price: 150 }] },
          { name: "Premium", is_recommended: true, items: [{ description: "Premium job", quantity: 1, unit_price: 500 }] }
        ]
      });

    expect(edited.status).toBe(200);

    const fetched = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched.body.tiers).toHaveLength(2);
    expect(fetched.body.tiers.map((t) => t.name)).toEqual(["Standard", "Premium"]);
    expect(fetched.body.total).toBeCloseTo(500);

  });


  test("a tiers-only edit is blocked once a payment has been recorded, same as every other price edit", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TierEditLockedAfterPayment");
    const customerId = await createCustomer(authHeader);

    // A tiered invoice, sent, with a partial payment recorded against it -
    // exactly the state the items/discount/deposit edit-lock exists for.
    const created = await createTieredQuote(authHeader, customerId, { type: "invoice" });
    await sendQuoteStatus(authHeader, created.body.id);

    const payment = await request(app)
      .post(`/api/quotes/${created.body.id}/payments`)
      .set("Authorization", authHeader)
      .send({ amount: 50, method: "cash" });

    expect(payment.status).toBe(201);

    // A request that touches ONLY tiers - no items/discount/deposit/tax
    // keys - used to skip the edit-lock entirely and let
    // replaceQuoteTiers wipe and rebuild every option anyway.
    const attempt = await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({
        tiers: [
          { name: "Rewritten A", items: [{ description: "New A", quantity: 1, unit_price: 10 }] },
          { name: "Rewritten B", is_recommended: true, items: [{ description: "New B", quantity: 1, unit_price: 20 }] }
        ]
      });

    expect(attempt.status).toBe(400);

    // The original three options are untouched.
    const fetched = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched.body.tiers.map((t) => t.name)).toEqual(["Good", "Better", "Best"]);

  });


  test("editing a tiered quote's items through the plain items field is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TierEditViaPlainItems");
    const customerId = await createCustomer(authHeader);

    const created = await createTieredQuote(authHeader, customerId);

    const attempt = await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ items: [{ description: "Sneaky flat edit", quantity: 1, unit_price: 999 }] });

    expect(attempt.status).toBe(400);

    // Nothing changed.
    const fetched = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched.body.tiers).toHaveLength(3);

  });


  test("a portal customer approving a tiered quote must also pick a tier", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TierPortalAccept");

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Portal Tier Customer", email: "portal-tier-customer@example.com" });

    const customerId = customerRes.body.id;

    const created = await createTieredQuote(authHeader, customerId);
    await sendQuoteStatus(authHeader, created.body.id);

    const slug = await getSlug(authHeader);
    const portalAuthHeader = await loginAsCustomer(slug, "portal-tier-customer@example.com");

    const noTier = await request(app)
      .post(`/api/portal/account/quotes/${created.body.id}/accept`)
      .set("Authorization", portalAuthHeader)
      .send({ name: "Portal Customer", signature: TEST_SIGNATURE });

    expect(noTier.status).toBe(400);

    const bestTierId = (await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)).body.tiers.find((t) => t.name === "Best").id;

    const withTier = await request(app)
      .post(`/api/portal/account/quotes/${created.body.id}/accept`)
      .set("Authorization", portalAuthHeader)
      .send({ name: "Portal Customer", signature: TEST_SIGNATURE, tier_id: bestTierId });

    expect(withTier.status).toBe(200);

    const fetched = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched.body.accepted_tier_id).toBe(bestTierId);
    expect(fetched.body.total).toBeCloseTo(925);

  });


  test("a portal customer can fetch a single quote's full tier breakdown, scoped to their own quotes", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TierPortalDetail");

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Portal Detail Customer", email: "portal-detail-customer@example.com" });

    const otherCustomerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Other Customer", email: "portal-detail-other@example.com" });

    const created = await createTieredQuote(authHeader, customerRes.body.id);
    await sendQuoteStatus(authHeader, created.body.id);

    const slug = await getSlug(authHeader);
    const ownAuthHeader = await loginAsCustomer(slug, "portal-detail-customer@example.com");
    const otherAuthHeader = await loginAsCustomer(slug, "portal-detail-other@example.com");

    const own = await request(app)
      .get(`/api/portal/account/quotes/${created.body.id}`)
      .set("Authorization", ownAuthHeader);

    expect(own.status).toBe(200);
    expect(own.body.tiers).toHaveLength(3);

    const other = await request(app)
      .get(`/api/portal/account/quotes/${created.body.id}`)
      .set("Authorization", otherAuthHeader);

    expect(other.status).toBe(404);

  });


  test("the PDF renders cleanly both before a tier is chosen and after one is accepted", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TierPdf");
    const customerId = await createCustomer(authHeader);

    const created = await createTieredQuote(authHeader, customerId);
    await sendQuoteStatus(authHeader, created.body.id);

    const downloadPdf = () =>
      request(app)
        .get(`/api/quotes/${created.body.id}/pdf`)
        .set("Authorization", authHeader)
        .buffer(true)
        .parse((res, callback) => {
          res.setEncoding("binary");
          let data = "";
          res.on("data", (chunk) => { data += chunk; });
          res.on("end", () => callback(null, Buffer.from(data, "binary")));
        });

    const beforeAccept = await downloadPdf();

    expect(beforeAccept.status).toBe(200);
    expect(beforeAccept.headers["content-type"]).toBe("application/pdf");
    expect(beforeAccept.body.length).toBeGreaterThan(0);

    const tierId = (await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)).body.tiers[0].id;

    await request(app)
      .post(`/api/quotes/${created.body.id}/sign`)
      .set("Authorization", authHeader)
      .send({ name: "PDF Signer", signature: TEST_SIGNATURE, tier_id: tierId });

    const afterAccept = await downloadPdf();

    expect(afterAccept.status).toBe(200);
    expect(afterAccept.headers["content-type"]).toBe("application/pdf");
    expect(afterAccept.body.length).toBeGreaterThan(0);

  });

});
