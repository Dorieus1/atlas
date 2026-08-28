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


const ITEMS = [{ description: "Roof inspection", quantity: 1, unit_price: 150 }];

// A minimal valid 1x1 transparent PNG.
const TEST_SIGNATURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";


const createSentQuote = async (authHeader, customerId) => {

  const created = await request(app)
    .post("/api/quotes")
    .set("Authorization", authHeader)
    .send({ customer_id: customerId, items: ITEMS });

  await request(app)
    .patch(`/api/quotes/${created.body.id}`)
    .set("Authorization", authHeader)
    .send({ status: "sent" });

  return created.body.id;

};


describe("Signing a quote in person (staff-side)", () => {

  test("a staff member can capture a customer's signature directly on a sent quote", async () => {

    const { authHeader } = await createBusinessAndUser(app, "SignInPerson");
    const customerId = await createCustomer(authHeader, "Sign Customer");
    const quoteId = await createSentQuote(authHeader, customerId);

    const signed = await request(app)
      .post(`/api/quotes/${quoteId}/sign`)
      .set("Authorization", authHeader)
      .send({ name: "Jane In-Person", signature: TEST_SIGNATURE });

    expect(signed.status).toBe(200);

    const fetched = await request(app)
      .get(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader);

    expect(fetched.body.status).toBe("accepted");
    expect(fetched.body.accepted_by_name).toBe("Jane In-Person");
    expect(fetched.body.accepted_at).toBeTruthy();
    expect(fetched.body.signature).toBe(TEST_SIGNATURE);
    expect(fetched.body.signature_method).toBe("in_person");

  });


  test("a missing name, missing signature, or malformed signature is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "SignValidation");
    const customerId = await createCustomer(authHeader, "Validation Customer");
    const quoteId = await createSentQuote(authHeader, customerId);

    const noName = await request(app)
      .post(`/api/quotes/${quoteId}/sign`)
      .set("Authorization", authHeader)
      .send({ signature: TEST_SIGNATURE });

    expect(noName.status).toBe(400);

    const noSignature = await request(app)
      .post(`/api/quotes/${quoteId}/sign`)
      .set("Authorization", authHeader)
      .send({ name: "Someone" });

    expect(noSignature.status).toBe(400);

    const badSignature = await request(app)
      .post(`/api/quotes/${quoteId}/sign`)
      .set("Authorization", authHeader)
      .send({ name: "Someone", signature: "not-a-real-image" });

    expect(badSignature.status).toBe(400);

    // None of the bad attempts should have changed anything.
    const fetched = await request(app)
      .get(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader);

    expect(fetched.body.status).toBe("sent");

  });


  test("a draft (never sent) quote can't be signed", async () => {

    const { authHeader } = await createBusinessAndUser(app, "SignDraftBlocked");
    const customerId = await createCustomer(authHeader, "Draft Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: ITEMS });

    const signed = await request(app)
      .post(`/api/quotes/${created.body.id}/sign`)
      .set("Authorization", authHeader)
      .send({ name: "Someone", signature: TEST_SIGNATURE });

    expect(signed.status).toBe(400);

  });


  test("an already-signed quote can't be signed again", async () => {

    const { authHeader } = await createBusinessAndUser(app, "SignTwiceBlocked");
    const customerId = await createCustomer(authHeader, "Twice Customer");
    const quoteId = await createSentQuote(authHeader, customerId);

    await request(app)
      .post(`/api/quotes/${quoteId}/sign`)
      .set("Authorization", authHeader)
      .send({ name: "First Signer", signature: TEST_SIGNATURE });

    const secondAttempt = await request(app)
      .post(`/api/quotes/${quoteId}/sign`)
      .set("Authorization", authHeader)
      .send({ name: "Second Signer", signature: TEST_SIGNATURE });

    expect(secondAttempt.status).toBe(400);

    const fetched = await request(app)
      .get(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader);

    // Still attributed to whoever actually signed first.
    expect(fetched.body.accepted_by_name).toBe("First Signer");

  });


  // Regression test for a real race a peer review caught: the sequential
  // test above (await one attempt, then the other) always passed even
  // before the fix, because the second call's own read happened after
  // the first had already committed. Two ordinary double-taps on a slow
  // connection can genuinely overlap - both reading status='sent' before
  // either write lands - so this fires them with Promise.all instead.
  // Before the fix (updateQuoteFields with no status guard in its own
  // WHERE clause), both writes could succeed and the second would
  // silently clobber the first's signature/name.
  test("two truly concurrent sign attempts on the same quote don't both win", async () => {

    const { authHeader } = await createBusinessAndUser(app, "SignConcurrent");
    const customerId = await createCustomer(authHeader, "Concurrent Customer");
    const quoteId = await createSentQuote(authHeader, customerId);

    const [first, second] = await Promise.all([

      request(app)
        .post(`/api/quotes/${quoteId}/sign`)
        .set("Authorization", authHeader)
        .send({ name: "Signer A", signature: TEST_SIGNATURE }),

      request(app)
        .post(`/api/quotes/${quoteId}/sign`)
        .set("Authorization", authHeader)
        .send({ name: "Signer B", signature: TEST_SIGNATURE })

    ]);

    const statuses = [first.status, second.status].sort();

    // Exactly one wins (200) and exactly one loses (400) - never both
    // succeeding (which would mean one silently clobbered the other)
    // and never both failing (which would mean the quote never actually
    // got signed at all).
    expect(statuses).toEqual([200, 400]);

    const fetched = await request(app)
      .get(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader);

    expect(fetched.body.status).toBe("accepted");
    expect(["Signer A", "Signer B"]).toContain(fetched.body.accepted_by_name);

  });


  test("a nonexistent quote 404s, and a business can't sign another business's quote", async () => {

    const businessA = await createBusinessAndUser(app, "SignScopeA");
    const businessB = await createBusinessAndUser(app, "SignScopeB");

    const customerId = await createCustomer(businessA.authHeader, "Scope Customer");
    const quoteId = await createSentQuote(businessA.authHeader, customerId);

    const notFound = await request(app)
      .post(`/api/quotes/does-not-exist/sign`)
      .set("Authorization", businessA.authHeader)
      .send({ name: "Someone", signature: TEST_SIGNATURE });

    expect(notFound.status).toBe(404);

    const crossBusiness = await request(app)
      .post(`/api/quotes/${quoteId}/sign`)
      .set("Authorization", businessB.authHeader)
      .send({ name: "Sneaky", signature: TEST_SIGNATURE });

    expect(crossBusiness.status).toBe(404);

  });


  test("the PDF still downloads cleanly once a quote carries a signature", async () => {

    const { authHeader } = await createBusinessAndUser(app, "SignPdf");
    const customerId = await createCustomer(authHeader, "PDF Customer");
    const quoteId = await createSentQuote(authHeader, customerId);

    await request(app)
      .post(`/api/quotes/${quoteId}/sign`)
      .set("Authorization", authHeader)
      .send({ name: "PDF Signer", signature: TEST_SIGNATURE });

    const pdf = await request(app)
      .get(`/api/quotes/${quoteId}/pdf`)
      .set("Authorization", authHeader)
      .buffer(true)
      .parse((res, callback) => {
        res.setEncoding("binary");
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => callback(null, Buffer.from(data, "binary")));
      });

    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.body.length).toBeGreaterThan(0);

  });

});
