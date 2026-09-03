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


const connectAndOnboard = async (authHeader) => {

  await request(app)
    .post("/api/stripe/connect/start")
    .set("Authorization", authHeader);

  await request(app)
    .get("/api/stripe/connect/status")
    .set("Authorization", authHeader);

};


// Sets the business's default tax rate through the real Settings save
// path, same as an owner would.
const setDefaultTaxRate = async (authHeader, rate) => {

  const biz = await request(app).get("/api/business").set("Authorization", authHeader);

  return request(app)
    .put("/api/business")
    .set("Authorization", authHeader)
    .send({ ...biz.body[0], default_tax_rate: rate });

};


const parseCsvLine = (line) => {

  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {

    const char = line[i];

    if (inQuotes) {

      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }

    } else if (char === '"') {

      inQuotes = true;

    } else if (char === ",") {

      fields.push(current);
      current = "";

    } else {

      current += char;

    }

  }

  fields.push(current);

  return fields;

};

const parseCsv = (text) => {

  const lines = text.split("\r\n").filter((line) => line.length > 0);

  return lines.map(parseCsvLine);

};


const getPdfBuffer = (req) =>

  req.buffer(true).parse((res, callback) => {
    res.setEncoding("binary");
    let data = "";
    res.on("data", (chunk) => { data += chunk; });
    res.on("end", () => callback(null, Buffer.from(data, "binary")));
  });


const ITEMS = [
  { description: "Roof inspection", quantity: 1, unit_price: 150 },
  { description: "Shingle replacement (per bundle)", quantity: 4, unit_price: 85 }
];

// 150 + 4*85 = 490
const SUBTOTAL = 490;


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


describe("Quote tax", () => {

  test("an explicit tax_rate is computed on the discounted amount, not the raw subtotal", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TaxExplicit");
    const customerId = await createCustomer(authHeader, "Tax Customer");

    // 490 subtotal, 10% off -> 441 taxable, 8% tax -> 35.28 tax, total 476.28
    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        items: ITEMS,
        discount_type: "percent",
        discount_value: 10,
        tax_rate: 8
      });

    expect(created.status).toBe(201);

    const fetched = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched.body.subtotal).toBe(SUBTOTAL);
    expect(fetched.body.discount_amount).toBe(49);
    expect(fetched.body.tax_rate).toBe(8);
    expect(fetched.body.tax_amount).toBe(35.28);
    expect(fetched.body.total).toBe(476.28);

  });


  test("omitting tax_rate falls back to the business's configured default", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TaxDefault");
    const customerId = await createCustomer(authHeader, "Tax Default Customer");

    const settingsRes = await setDefaultTaxRate(authHeader, 5);
    expect(settingsRes.status).toBe(200);

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS });

    const fetched = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched.body.tax_rate).toBe(5);
    expect(fetched.body.tax_amount).toBe(24.5);
    expect(fetched.body.total).toBe(SUBTOTAL + 24.5);

  });


  test("an explicit tax_rate of 0 overrides the business default to no tax on this quote", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TaxOverrideZero");
    const customerId = await createCustomer(authHeader, "Tax Override Customer");

    await setDefaultTaxRate(authHeader, 7.5);

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS, tax_rate: 0 });

    const fetched = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched.body.tax_amount).toBe(0);
    expect(fetched.body.total).toBe(SUBTOTAL);

  });


  test("changing the business default later never retroactively changes an already-created quote's tax", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TaxSnapshot");
    const customerId = await createCustomer(authHeader, "Tax Snapshot Customer");

    await setDefaultTaxRate(authHeader, 10);

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS });

    await setDefaultTaxRate(authHeader, 20);

    const fetched = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched.body.tax_rate).toBe(10);
    expect(fetched.body.tax_amount).toBe(49);

  });


  test("a negative or over-100 tax_rate is rejected at creation and update", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TaxInvalid");
    const customerId = await createCustomer(authHeader, "Tax Invalid Customer");

    const negative = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS, tax_rate: -1 });

    expect(negative.status).toBe(400);

    const tooBig = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS, tax_rate: 101 });

    expect(tooBig.status).toBe(400);

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS });

    const badUpdate = await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ tax_rate: 150 });

    expect(badUpdate.status).toBe(400);

  });


  test("updating a quote's tax rate recalculates the total, but is blocked once it's paid", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TaxUpdate");
    const customerId = await createCustomer(authHeader, "Tax Update Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, type: "invoice", items: ITEMS });

    const updated = await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ tax_rate: 10 });

    expect(updated.status).toBe(200);

    const fetched = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched.body.tax_amount).toBe(49);
    expect(fetched.body.total).toBe(SUBTOTAL + 49);

    await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "paid" });

    const blockedUpdate = await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ tax_rate: 20 });

    expect(blockedUpdate.status).toBe(400);

  });


  test("the CSV export's Tax column reflects the real tax amount, and Total includes it", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TaxCsv");
    const customerId = await createCustomer(authHeader, "CSV Tax Customer", "csvtax@test.com");

    await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS, tax_rate: 10 });

    const res = await request(app)
      .get("/api/quotes/export.csv")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);

    const rows = parseCsv(res.text);

    expect(rows[0]).toContain("Tax");

    const taxIndex = rows[0].indexOf("Tax");
    const totalIndex = rows[0].indexOf("Total");

    expect(rows[1][taxIndex]).toBe("49.00");
    expect(rows[1][totalIndex]).toBe((SUBTOTAL + 49).toFixed(2));

  });


  test("the generated PDF for a taxed invoice doesn't crash and produces a non-trivial byte size", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TaxPdf");
    const customerId = await createCustomer(authHeader, "PDF Tax Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, type: "invoice", items: ITEMS, tax_rate: 8.5 });

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


  test("a taxed invoice with no discount charges items plus a separate Stripe tax line item", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TaxStripeOnly");
    const slug = await getSlug(authHeader);

    await connectAndOnboard(authHeader);

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Stripe Tax Customer", email: "stripetax@test.com" });

    const invoiceRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerRes.body.id,
        type: "invoice",
        items: ITEMS,
        tax_rate: 10
      });

    await request(app)
      .patch(`/api/quotes/${invoiceRes.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "sent" });

    const customerAuthHeader = await loginAsCustomer(slug, "stripetax@test.com");

    const checkout = await request(app)
      .post(`/api/portal/account/quotes/${invoiceRes.body.id}/checkout`)
      .set("Authorization", customerAuthHeader);

    expect(checkout.status).toBe(200);
    expect(global.__mockStripe.couponsCreate).not.toHaveBeenCalled();

    const sessionArgs = global.__mockStripe.checkoutSessionsCreate.mock.calls[0][0];

    // Original items untouched, plus a third line item for tax.
    expect(sessionArgs.line_items).toHaveLength(3);
    expect(sessionArgs.line_items[0].price_data.unit_amount).toBe(150 * 100);
    expect(sessionArgs.line_items[1].price_data.unit_amount).toBe(85 * 100);
    expect(sessionArgs.line_items[2].price_data.product_data.name).toContain("Tax");
    expect(sessionArgs.line_items[2].price_data.unit_amount).toBe(4900);

  });


  test("an invoice with BOTH a discount and tax collapses to a single line item for the exact total, since a Stripe coupon can't be scoped away from a separate tax line", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TaxStripeWithDiscount");
    const slug = await getSlug(authHeader);

    await connectAndOnboard(authHeader);

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Stripe Tax Discount Customer", email: "stripetaxdiscount@test.com" });

    const invoiceRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerRes.body.id,
        type: "invoice",
        items: ITEMS,
        discount_type: "percent",
        discount_value: 10,
        tax_rate: 8
      });

    await request(app)
      .patch(`/api/quotes/${invoiceRes.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "sent" });

    const customerAuthHeader = await loginAsCustomer(slug, "stripetaxdiscount@test.com");

    const checkout = await request(app)
      .post(`/api/portal/account/quotes/${invoiceRes.body.id}/checkout`)
      .set("Authorization", customerAuthHeader);

    expect(checkout.status).toBe(200);

    // No coupon at all - the discount is baked into the single line's
    // price instead, since a session-level coupon would also (wrongly)
    // discount a separately-added tax line.
    expect(global.__mockStripe.couponsCreate).not.toHaveBeenCalled();

    const sessionArgs = global.__mockStripe.checkoutSessionsCreate.mock.calls[0][0];

    expect(sessionArgs.discounts).toBeUndefined();
    expect(sessionArgs.line_items).toHaveLength(1);
    // 490 subtotal, 10% off -> 441, 8% tax -> 476.28 total.
    expect(sessionArgs.line_items[0].price_data.unit_amount).toBe(47628);

  });


  test("revenue analytics reflect the tax-inclusive amount actually collected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TaxAnalytics");
    const customerId = await createCustomer(authHeader, "Tax Analytics Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, type: "invoice", items: ITEMS, tax_rate: 10 });

    await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "paid" });

    const analytics = await request(app)
      .get("/api/analytics")
      .set("Authorization", authHeader);

    expect(analytics.body.revenuePaid).toBe(SUBTOTAL + 49);

  });


  test("a default_tax_rate outside 0-100 is rejected when saving business settings", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TaxSettingsInvalid");

    const res = await setDefaultTaxRate(authHeader, 250);

    expect(res.status).toBe(400);

  });

});
