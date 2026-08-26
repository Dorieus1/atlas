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


// Minimal CSV row parser - same approach as csvExport.test.js.
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


describe("Quote discounts", () => {

  test("a fixed discount reduces the total and is reflected in getQuoteById's response", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DiscountFixed");
    const customerId = await createCustomer(authHeader, "Fixed Discount Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS, discount_type: "fixed", discount_value: 40 });

    expect(created.status).toBe(201);

    const fetched = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched.status).toBe(200);
    expect(fetched.body.subtotal).toBe(SUBTOTAL);
    expect(fetched.body.discount_amount).toBe(40);
    expect(fetched.body.total).toBe(SUBTOTAL - 40);
    expect(fetched.body.discount_type).toBe("fixed");
    expect(fetched.body.discount_value).toBe(40);

  });


  test("a percent discount reduces the total and is reflected in getQuoteById's response", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DiscountPercent");
    const customerId = await createCustomer(authHeader, "Percent Discount Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS, discount_type: "percent", discount_value: 10 });

    expect(created.status).toBe(201);

    const fetched = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched.status).toBe(200);
    expect(fetched.body.subtotal).toBe(SUBTOTAL);
    expect(fetched.body.discount_amount).toBe(SUBTOTAL * 0.1);
    expect(fetched.body.total).toBe(SUBTOTAL - SUBTOTAL * 0.1);

  });


  test("a fixed discount larger than the subtotal is rejected at creation", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DiscountFixedTooBigCreate");
    const customerId = await createCustomer(authHeader, "Too Big Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS, discount_type: "fixed", discount_value: SUBTOTAL + 1 });

    expect(created.status).toBe(400);
    expect(created.body.error).toMatch(/subtotal/i);

  });


  test("a fixed discount larger than the subtotal is rejected at update", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DiscountFixedTooBigUpdate");
    const customerId = await createCustomer(authHeader, "Too Big Update Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS });

    const update = await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ discount_type: "fixed", discount_value: SUBTOTAL + 1 });

    expect(update.status).toBe(400);
    expect(update.body.error).toMatch(/subtotal/i);

    // Confirms the rejected update didn't get partially applied.
    const fetched = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched.body.discount_type).toBeNull();
    expect(fetched.body.total).toBe(SUBTOTAL);

  });


  test("replacing line items with a smaller set that no longer fits an existing fixed discount is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DiscountShrinkItems");
    const customerId = await createCustomer(authHeader, "Shrink Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS, discount_type: "fixed", discount_value: 100 });

    expect(created.status).toBe(201);

    const shrink = await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ items: [{ description: "Small job", quantity: 1, unit_price: 50 }] });

    expect(shrink.status).toBe(400);
    expect(shrink.body.error).toMatch(/subtotal/i);

  });


  test("a percent discount over 100 is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DiscountOver100");
    const customerId = await createCustomer(authHeader, "Over 100 Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS, discount_type: "percent", discount_value: 101 });

    expect(created.status).toBe(400);

  });


  test("a discount_type with no discount_value (or vice versa) is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DiscountMismatch");
    const customerId = await createCustomer(authHeader, "Mismatch Customer");

    const typeOnly = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS, discount_type: "percent" });

    expect(typeOnly.status).toBe(400);

    const valueOnly = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS, discount_value: 10 });

    expect(valueOnly.status).toBe(400);

  });


  test("a quote with no discount behaves exactly as before", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DiscountNone");
    const customerId = await createCustomer(authHeader, "No Discount Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS });

    expect(created.status).toBe(201);

    const fetched = await request(app)
      .get(`/api/quotes/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched.body.discount_type).toBeNull();
    expect(fetched.body.discount_amount).toBe(0);
    expect(fetched.body.subtotal).toBe(SUBTOTAL);
    expect(fetched.body.total).toBe(SUBTOTAL);

    const list = await request(app)
      .get("/api/quotes")
      .set("Authorization", authHeader);

    expect(list.body[0].total).toBe(SUBTOTAL);

  });


  test("the CSV export's Total column reflects the discounted total, not the pre-discount subtotal", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DiscountCsv");
    const customerId = await createCustomer(authHeader, "CSV Discount Customer", "csvdiscount@test.com");

    await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS, discount_type: "fixed", discount_value: 90 });

    const res = await request(app)
      .get("/api/quotes/export.csv")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);

    const rows = parseCsv(res.text);

    // Index 6, not 5 - a "Tax" column now sits between Items and Total
    // (see csvService.js).
    expect(rows[1][6]).toBe((SUBTOTAL - 90).toFixed(2));
    expect(rows[1][6]).not.toBe(SUBTOTAL.toFixed(2));

  });


  test("the generated PDF for a discounted quote doesn't crash and produces a non-trivial byte size", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DiscountPdf");
    const customerId = await createCustomer(authHeader, "PDF Discount Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, type: "invoice", items: ITEMS, discount_type: "percent", discount_value: 20 });

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


  test("the Stripe Checkout Session for a discounted invoice carries the discount as a one-time coupon", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DiscountStripe");
    const slug = await getSlug(authHeader);

    await connectAndOnboard(authHeader);

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Stripe Discount Customer", email: "stripediscount@test.com" });

    const invoiceRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerRes.body.id,
        type: "invoice",
        items: ITEMS,
        discount_type: "percent",
        discount_value: 15
      });

    await request(app)
      .patch(`/api/quotes/${invoiceRes.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "sent" });

    const customerAuthHeader = await loginAsCustomer(slug, "stripediscount@test.com");

    const checkout = await request(app)
      .post(`/api/portal/account/quotes/${invoiceRes.body.id}/checkout`)
      .set("Authorization", customerAuthHeader);

    expect(checkout.status).toBe(200);

    // A one-time coupon is created first, on the connected account, since
    // Stripe Checkout Sessions only accept a discount by referencing a
    // coupon/promotion_code id - there's no inline percent_off/amount_off
    // shape on the session itself.
    expect(global.__mockStripe.couponsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ percent_off: 15, duration: "once" }),
      expect.objectContaining({ stripeAccount: "acct_test123" })
    );

    // The session itself references that coupon via `discounts`, not by
    // shrinking any individual line item's price.
    expect(global.__mockStripe.checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ discounts: [{ coupon: "coupon_test_123" }] }),
      expect.objectContaining({ stripeAccount: "acct_test123" })
    );

    const sessionArgs = global.__mockStripe.checkoutSessionsCreate.mock.calls[0][0];

    // Line items themselves stay at full price - the discount is only
    // ever applied via the coupon, never by discounting individual items.
    expect(sessionArgs.line_items[0].price_data.unit_amount).toBe(150 * 100);
    expect(sessionArgs.line_items[1].price_data.unit_amount).toBe(85 * 100);

  });


  test("the Stripe Checkout Session for a fixed-amount discount carries an amount_off coupon in cents", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DiscountStripeFixed");
    const slug = await getSlug(authHeader);

    await connectAndOnboard(authHeader);

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Stripe Fixed Discount Customer", email: "stripefixeddiscount@test.com" });

    const invoiceRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerRes.body.id,
        type: "invoice",
        items: ITEMS,
        discount_type: "fixed",
        discount_value: 25
      });

    await request(app)
      .patch(`/api/quotes/${invoiceRes.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "sent" });

    const customerAuthHeader = await loginAsCustomer(slug, "stripefixeddiscount@test.com");

    const checkout = await request(app)
      .post(`/api/portal/account/quotes/${invoiceRes.body.id}/checkout`)
      .set("Authorization", customerAuthHeader);

    expect(checkout.status).toBe(200);

    expect(global.__mockStripe.couponsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount_off: 2500, currency: "usd", duration: "once" }),
      expect.objectContaining({ stripeAccount: "acct_test123" })
    );

  });


  test("a checkout session for an invoice with no discount never creates a coupon", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DiscountStripeNone");
    const slug = await getSlug(authHeader);

    await connectAndOnboard(authHeader);

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "No Discount Stripe Customer", email: "nodiscountstripe@test.com" });

    const invoiceRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerRes.body.id, type: "invoice", items: ITEMS });

    await request(app)
      .patch(`/api/quotes/${invoiceRes.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "sent" });

    const customerAuthHeader = await loginAsCustomer(slug, "nodiscountstripe@test.com");

    const checkout = await request(app)
      .post(`/api/portal/account/quotes/${invoiceRes.body.id}/checkout`)
      .set("Authorization", customerAuthHeader);

    expect(checkout.status).toBe(200);
    expect(global.__mockStripe.couponsCreate).not.toHaveBeenCalled();

    const sessionArgs = global.__mockStripe.checkoutSessionsCreate.mock.calls[0][0];

    expect(sessionArgs.discounts).toBeUndefined();

  });

});
