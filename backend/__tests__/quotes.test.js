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
  { description: "Roof inspection", quantity: 1, unit_price: 150 },
  { description: "Shingle replacement (per bundle)", quantity: 4, unit_price: 85 }
];

const getPdfBuffer = (req) =>

  req.buffer(true).parse((res, callback) => {
    res.setEncoding("binary");
    let data = "";
    res.on("data", (chunk) => { data += chunk; });
    res.on("end", () => callback(null, Buffer.from(data, "binary")));
  });

// The page tree's /Count field is the authoritative, unambiguous page
// count in a PDF's structure - counting "/Type /Page" substrings would
// double-count the "/Type /Pages" tree root itself.
const pdfPageCount = (buffer) => {

  const match = buffer.toString("latin1").match(/\/Type\s*\/Pages[^>]*\/Count\s+(\d+)/);

  return match ? Number(match[1]) : null;

};

describe("Quotes and Invoices", () => {

  test("a quote requires a customer and at least one valid line item, and computes its total", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QuoteValidation");
    const customerId = await createCustomer(app, authHeader, "Quote Customer");

    const noCustomer = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ items: VALID_ITEMS });

    expect(noCustomer.status).toBe(400);

    const noItems = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: [] });

    expect(noItems.status).toBe(400);

    const badQuantity = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        items: [{ description: "Bad item", quantity: -1, unit_price: 10 }]
      });

    expect(badQuantity.status).toBe(400);

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: VALID_ITEMS });

    expect(created.status).toBe(201);

    const list = await request(app)
      .get("/api/quotes")
      .set("Authorization", authHeader);

    expect(list.body[0].total).toBe(150 + 4 * 85);
    expect(list.body[0].type).toBe("quote");
    expect(list.body[0].status).toBe("draft");

  });

  test("a quote cannot be created against another business's customer", async () => {

    const bizA = await createBusinessAndUser(app, "QuoteCrossA");
    const bizB = await createBusinessAndUser(app, "QuoteCrossB");

    const customerId = await createCustomer(app, bizA.authHeader, "A's Customer");

    const attempt = await request(app)
      .post("/api/quotes")
      .set("Authorization", bizB.authHeader)
      .send({ customer_id: customerId, items: VALID_ITEMS });

    expect(attempt.status).toBe(404);

  });

  test("fetching a single quote returns its line items, and is scoped to the right business", async () => {

    const bizA = await createBusinessAndUser(app, "QuoteDetailA");
    const bizB = await createBusinessAndUser(app, "QuoteDetailB");

    const customerId = await createCustomer(app, bizA.authHeader, "Detail Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", bizA.authHeader)
      .send({ customer_id: customerId, items: VALID_ITEMS });

    const quoteId = created.body.id;

    const ownFetch = await request(app)
      .get(`/api/quotes/${quoteId}`)
      .set("Authorization", bizA.authHeader);

    expect(ownFetch.status).toBe(200);
    expect(ownFetch.body.items.length).toBe(2);

    const crossFetch = await request(app)
      .get(`/api/quotes/${quoteId}`)
      .set("Authorization", bizB.authHeader);

    expect(crossFetch.status).toBe(404);

  });

  test("a quote can be converted to an invoice and marked paid, but not with an invalid status", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QuoteConvert");
    const customerId = await createCustomer(app, authHeader, "Convert Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: VALID_ITEMS });

    const quoteId = created.body.id;

    const badStatus = await request(app)
      .patch(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader)
      .send({ status: "not-a-real-status" });

    expect(badStatus.status).toBe(400);

    const convert = await request(app)
      .patch(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader)
      .send({ type: "invoice", status: "paid" });

    expect(convert.status).toBe(200);

    const fetched = await request(app)
      .get(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader);

    expect(fetched.body.type).toBe("invoice");
    expect(fetched.body.status).toBe("paid");

  });

  test("line items can be replaced, and the total updates to match", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QuoteReplaceItems");
    const customerId = await createCustomer(app, authHeader, "Replace Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: VALID_ITEMS });

    const quoteId = created.body.id;

    const replace = await request(app)
      .patch(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader)
      .send({ items: [{ description: "Simplified job", quantity: 1, unit_price: 500 }] });

    expect(replace.status).toBe(200);

    const fetched = await request(app)
      .get(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader);

    expect(fetched.body.total).toBe(500);
    expect(fetched.body.items.length).toBe(1);

  });

  test("deleting a quote works for the owning business, and is rejected for another", async () => {

    const bizA = await createBusinessAndUser(app, "QuoteDeleteA");
    const bizB = await createBusinessAndUser(app, "QuoteDeleteB");

    const customerId = await createCustomer(app, bizA.authHeader, "Delete Customer");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", bizA.authHeader)
      .send({ customer_id: customerId, items: VALID_ITEMS });

    const quoteId = created.body.id;

    const bAttempt = await request(app)
      .delete(`/api/quotes/${quoteId}`)
      .set("Authorization", bizB.authHeader);

    expect(bAttempt.status).toBe(404);

    // Regression check for a real bug a review pass caught: the 404
    // above used to be a lie - deleteQuote's child deletes (items,
    // expenses, payments) ran unscoped by business_id BEFORE the
    // ownership check, so business B's blocked delete attempt was
    // silently wiping business A's line items anyway even though the
    // parent quote row (correctly scoped) survived and the API reported
    // 404. The quote must still have every line item it started with.
    const survivedQuote = await request(app)
      .get(`/api/quotes/${quoteId}`)
      .set("Authorization", bizA.authHeader);

    expect(survivedQuote.body.items.length).toBe(VALID_ITEMS.length);

    const ownDelete = await request(app)
      .delete(`/api/quotes/${quoteId}`)
      .set("Authorization", bizA.authHeader);

    expect(ownDelete.status).toBe(200);

    const list = await request(app)
      .get("/api/quotes")
      .set("Authorization", bizA.authHeader);

    expect(list.body.length).toBe(0);

  });

  test("a customer's quotes can be listed by customer_id, scoped to the right business", async () => {

    const bizA = await createBusinessAndUser(app, "QuoteListA");
    const bizB = await createBusinessAndUser(app, "QuoteListB");

    const customerId = await createCustomer(app, bizA.authHeader, "List Customer");

    await request(app)
      .post("/api/quotes")
      .set("Authorization", bizA.authHeader)
      .send({ customer_id: customerId, items: VALID_ITEMS });

    const ownList = await request(app)
      .get(`/api/quotes/customer/${customerId}`)
      .set("Authorization", bizA.authHeader);

    expect(ownList.status).toBe(200);
    expect(ownList.body.length).toBe(1);

    const crossList = await request(app)
      .get(`/api/quotes/customer/${customerId}`)
      .set("Authorization", bizB.authHeader);

    expect(crossList.status).toBe(404);

  });

  test("deleting a customer moves them to the trash without touching their quotes and line items", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QuoteCustomerCascade");
    const customerId = await createCustomer(app, authHeader, "Cascade Customer");

    await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, items: VALID_ITEMS });

    await request(app)
      .delete(`/api/customers/${customerId}`)
      .set("Authorization", authHeader);

    // Soft delete doesn't cascade - the quote is only removed once the
    // customer is permanently purged after 30 days in the trash (see
    // backend/__tests__/customerTrash.test.js).
    const list = await request(app)
      .get("/api/quotes")
      .set("Authorization", authHeader);

    expect(list.body.length).toBe(1);

  });


  test("a PDF can be downloaded for a quote, and it's a real PDF", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QuotePdf");
    const customerId = await createCustomer(app, authHeader, "PDF Customer");

    const quoteRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, type: "invoice", items: VALID_ITEMS });

    const pdf = await request(app)
      .get(`/api/quotes/${quoteRes.body.id}/pdf`)
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
    expect(pdf.body.slice(0, 4).toString()).toBe("%PDF");
    expect(pdf.body.length).toBeGreaterThan(500);

  });


  test("a PDF can't be downloaded for another business's quote", async () => {

    const bizA = await createBusinessAndUser(app, "QuotePdfCrossA");
    const bizB = await createBusinessAndUser(app, "QuotePdfCrossB");
    const customerId = await createCustomer(app, bizA.authHeader, "Cross PDF Customer");

    const quoteRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", bizA.authHeader)
      .send({ customer_id: customerId, items: VALID_ITEMS });

    const pdf = await request(app)
      .get(`/api/quotes/${quoteRes.body.id}/pdf`)
      .set("Authorization", bizB.authHeader);

    expect(pdf.status).toBe(404);

  });


  test("a short invoice's PDF fits on one page", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QuotePdfOnePage");
    const customerId = await createCustomer(app, authHeader, "One Page Customer");

    const quoteRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, type: "invoice", items: VALID_ITEMS });

    const pdf = await getPdfBuffer(
      request(app)
        .get(`/api/quotes/${quoteRes.body.id}/pdf`)
        .set("Authorization", authHeader)
    );

    expect(pdfPageCount(pdf.body)).toBe(1);

  });


  test("a long invoice's line items spill onto additional pages instead of overlapping the total", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QuotePdfPagination");
    const customerId = await createCustomer(app, authHeader, "Pagination Customer");

    const manyItems = Array.from({ length: 35 }, (_, i) => ({
      description: `Line item number ${i + 1} - roofing material and labor`,
      quantity: 1,
      unit_price: 45.5
    }));

    const quoteRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, type: "invoice", notes: "A note to check too.", items: manyItems });

    const pdf = await getPdfBuffer(
      request(app)
        .get(`/api/quotes/${quoteRes.body.id}/pdf`)
        .set("Authorization", authHeader)
    );

    expect(pdf.status).toBe(200);
    expect(pdfPageCount(pdf.body)).toBeGreaterThanOrEqual(2);

  });

});
