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
  { description: "Roof inspection", quantity: 1, unit_price: 150 }
];

const createQuote = (app, authHeader, customer_id, type) =>

  request(app)
    .post("/api/quotes")
    .set("Authorization", authHeader)
    .send({ customer_id, type, items: VALID_ITEMS });


describe("Sequential quote/invoice numbers", () => {

  test("a new business's first quote starts at 1001", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QNumStart");
    const customerId = await createCustomer(app, authHeader, "Starter Customer");

    const created = await createQuote(app, authHeader, customerId, "quote");

    expect(created.status).toBe(201);
    expect(created.body.quote_number).toBe(1001);
    expect(created.body.quote_number_formatted).toBe("Q-1001");

  });

  test("a second quote for the same business gets the next number", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QNumSecond");
    const customerId = await createCustomer(app, authHeader, "Second Customer");

    const first = await createQuote(app, authHeader, customerId, "quote");
    const second = await createQuote(app, authHeader, customerId, "quote");

    expect(first.body.quote_number).toBe(1001);
    expect(second.body.quote_number).toBe(1002);

  });

  test("a quote and an invoice for the same business share one incrementing sequence", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QNumShared");
    const customerId = await createCustomer(app, authHeader, "Shared Customer");

    const quote = await createQuote(app, authHeader, customerId, "quote");
    const invoice = await createQuote(app, authHeader, customerId, "invoice");
    const secondQuote = await createQuote(app, authHeader, customerId, "quote");

    // One shared sequence across both types (rather than an independent
    // counter per type) - simpler to keep correct, and common in
    // small-business invoicing tools where a quote turning into an
    // invoice keeps referring to "the same document".
    expect(quote.body.quote_number).toBe(1001);
    expect(invoice.body.quote_number).toBe(1002);
    expect(secondQuote.body.quote_number).toBe(1003);

    expect(quote.body.quote_number_formatted).toBe("Q-1001");
    expect(invoice.body.quote_number_formatted).toBe("INV-1002");
    expect(secondQuote.body.quote_number_formatted).toBe("Q-1003");

  });

  test("two different businesses each start their own sequence independently", async () => {

    const bizA = await createBusinessAndUser(app, "QNumBizA");
    const bizB = await createBusinessAndUser(app, "QNumBizB");

    const customerA = await createCustomer(app, bizA.authHeader, "A Customer");
    const customerB = await createCustomer(app, bizB.authHeader, "B Customer");

    // Business A creates a few quotes first, to make sure its count
    // doesn't leak into business B's starting number.
    await createQuote(app, bizA.authHeader, customerA, "quote");
    await createQuote(app, bizA.authHeader, customerA, "quote");
    await createQuote(app, bizA.authHeader, customerA, "quote");

    const bFirst = await createQuote(app, bizB.authHeader, customerB, "quote");

    expect(bFirst.body.quote_number).toBe(1001);

  });

  test("the number is present and correctly formatted across list, get-by-id, and get-by-customer responses", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QNumResponses");
    const customerId = await createCustomer(app, authHeader, "Responses Customer");

    const created = await createQuote(app, authHeader, customerId, "invoice");
    const quoteId = created.body.id;

    const list = await request(app)
      .get("/api/quotes")
      .set("Authorization", authHeader);

    expect(list.body[0].quote_number).toBe(created.body.quote_number);
    expect(list.body[0].quote_number_formatted).toBe("INV-" + created.body.quote_number);

    const byId = await request(app)
      .get(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader);

    expect(byId.body.quote_number).toBe(created.body.quote_number);
    expect(byId.body.quote_number_formatted).toBe("INV-" + created.body.quote_number);

    const byCustomer = await request(app)
      .get(`/api/quotes/customer/${customerId}`)
      .set("Authorization", authHeader);

    expect(byCustomer.body[0].quote_number).toBe(created.body.quote_number);
    expect(byCustomer.body[0].quote_number_formatted).toBe("INV-" + created.body.quote_number);

  });

  // This is the real proof that the atomic-increment approach holds up:
  // fire several creates at the same business at once (simulating two
  // browser tabs, or a retried request) and confirm every quote_number
  // that comes back is unique, with no gaps and no collisions.
  test("concurrent quote creation for the same business assigns unique, gapless numbers", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QNumConcurrent");
    const customerId = await createCustomer(app, authHeader, "Concurrent Customer");

    const CONCURRENCY = 15;

    const responses = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => createQuote(app, authHeader, customerId, "quote"))
    );

    for (const res of responses) {
      expect(res.status).toBe(201);
    }

    const numbers = responses.map((res) => res.body.quote_number).sort((a, b) => a - b);
    const uniqueNumbers = new Set(numbers);

    expect(uniqueNumbers.size).toBe(CONCURRENCY);
    expect(numbers[0]).toBe(1001);
    expect(numbers[numbers.length - 1]).toBe(1001 + CONCURRENCY - 1);

    // No gaps: every number from the starting value should be present.
    for (let i = 0; i < CONCURRENCY; i++) {
      expect(numbers[i]).toBe(1001 + i);
    }

    // The count actually stored in the DB matches too, not just what the
    // API happened to respond with.
    const list = await request(app)
      .get("/api/quotes")
      .set("Authorization", authHeader);

    expect(list.body.length).toBe(CONCURRENCY);

    const storedNumbers = new Set(list.body.map((q) => q.quote_number));
    expect(storedNumbers.size).toBe(CONCURRENCY);

  });

  test("concurrent creation across two different businesses doesn't cross-contaminate their sequences", async () => {

    const bizA = await createBusinessAndUser(app, "QNumConcA");
    const bizB = await createBusinessAndUser(app, "QNumConcB");

    const customerA = await createCustomer(app, bizA.authHeader, "Conc Customer A");
    const customerB = await createCustomer(app, bizB.authHeader, "Conc Customer B");

    const CONCURRENCY = 8;

    const [resultsA, resultsB] = await Promise.all([
      Promise.all(Array.from({ length: CONCURRENCY }, () => createQuote(app, bizA.authHeader, customerA, "quote"))),
      Promise.all(Array.from({ length: CONCURRENCY }, () => createQuote(app, bizB.authHeader, customerB, "invoice")))
    ]);

    const numbersA = new Set(resultsA.map((res) => res.body.quote_number));
    const numbersB = new Set(resultsB.map((res) => res.body.quote_number));

    expect(numbersA.size).toBe(CONCURRENCY);
    expect(numbersB.size).toBe(CONCURRENCY);

    // Both businesses started fresh at 1001 and counted up independently,
    // even though their creates were interleaved in flight together.
    expect(Math.min(...numbersA)).toBe(1001);
    expect(Math.max(...numbersA)).toBe(1000 + CONCURRENCY);
    expect(Math.min(...numbersB)).toBe(1001);
    expect(Math.max(...numbersB)).toBe(1000 + CONCURRENCY);

  });

});
