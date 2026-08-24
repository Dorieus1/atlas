const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");

const createCustomer = async (app, authHeader, fields) => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send(fields);

  return res.body.id;

};

const setReviewLink = async (app, authHeader, review_link) => {

  await request(app)
    .put("/api/business")
    .set("Authorization", authHeader)
    .send({ name: "Whatever Business", review_link });

};

describe("Automation: completed appointment creates a draft invoice", () => {

  test("marking an appointment completed auto-creates a draft invoice pre-filled from it", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AutoInvoiceA");
    const customerId = await createCustomer(app, authHeader, { name: "Auto Invoice Customer" });

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, title: "Gutter cleaning", start_time: "2026-09-01T10:00:00.000Z" });

    const apptId = created.body.id;

    const completed = await request(app)
      .patch(`/api/appointments/${apptId}`)
      .set("Authorization", authHeader)
      .send({ status: "completed" });

    expect(completed.status).toBe(200);
    expect(completed.body.draft_invoice_id).toBeTruthy();

    const invoice = await request(app)
      .get(`/api/quotes/${completed.body.draft_invoice_id}`)
      .set("Authorization", authHeader);

    expect(invoice.status).toBe(200);
    expect(invoice.body.type).toBe("invoice");
    expect(invoice.body.status).toBe("draft");
    expect(invoice.body.customer_id).toBe(customerId);
    expect(invoice.body.items[0].description).toBe("Gutter cleaning");

  });

  test("completing the same appointment twice never creates a second invoice", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AutoInvoiceDupe");
    const customerId = await createCustomer(app, authHeader, { name: "Dupe Customer" });

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, title: "Roof patch", start_time: "2026-09-01T10:00:00.000Z" });

    const apptId = created.body.id;

    const first = await request(app)
      .patch(`/api/appointments/${apptId}`)
      .set("Authorization", authHeader)
      .send({ status: "completed" });

    await request(app)
      .patch(`/api/appointments/${apptId}`)
      .set("Authorization", authHeader)
      .send({ status: "scheduled" });

    const second = await request(app)
      .patch(`/api/appointments/${apptId}`)
      .set("Authorization", authHeader)
      .send({ status: "completed" });

    expect(second.body.draft_invoice_id).toBe(first.body.draft_invoice_id);

    const all = await request(app)
      .get("/api/quotes")
      .set("Authorization", authHeader);

    const forThisAppointment = all.body.filter((q) => q.appointment_id === apptId);

    expect(forThisAppointment.length).toBe(1);

  });

  test("an appointment with no linked customer completing doesn't create an invoice", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AutoInvoiceNoCustomer");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ title: "Blocked time, no customer", start_time: "2026-09-01T10:00:00.000Z" });

    const completed = await request(app)
      .patch(`/api/appointments/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "completed" });

    expect(completed.status).toBe(200);
    expect(completed.body.draft_invoice_id).toBeFalsy();

  });

  test("cancelling an appointment does not create an invoice", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AutoInvoiceCancelled");
    const customerId = await createCustomer(app, authHeader, { name: "Cancelled Customer" });

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, title: "Job that gets cancelled", start_time: "2026-09-01T10:00:00.000Z" });

    const cancelled = await request(app)
      .patch(`/api/appointments/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "cancelled" });

    expect(cancelled.body.draft_invoice_id).toBeFalsy();

  });

});

describe("Automation: an invoice marked paid auto-sends a review request", () => {

  test("marking an invoice paid sends a review request when the customer has an email and the business has a review link", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AutoReviewA");
    const customerId = await createCustomer(app, authHeader, { name: "Paid Customer", email: "paid@test.com" });

    await setReviewLink(app, authHeader, "https://g.page/r/example/review");

    const invoice = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        type: "invoice",
        items: [{ description: "Job", quantity: 1, unit_price: 200 }]
      });

    const paid = await request(app)
      .patch(`/api/quotes/${invoice.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "paid" });

    expect(paid.status).toBe(200);
    expect(paid.body.review_request_sent).toBe(true);

    const history = await request(app)
      .get(`/api/review-requests/customer/${customerId}`)
      .set("Authorization", authHeader);

    expect(history.body.length).toBe(1);

  });

  test("marking a quote (not an invoice) paid does not trigger a review request", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AutoReviewQuoteType");
    const customerId = await createCustomer(app, authHeader, { name: "Quote Customer", email: "quote@test.com" });

    await setReviewLink(app, authHeader, "https://g.page/r/example/review");

    const quote = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        type: "quote",
        items: [{ description: "Job", quantity: 1, unit_price: 200 }]
      });

    const paid = await request(app)
      .patch(`/api/quotes/${quote.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "paid" });

    expect(paid.body.review_request_sent).toBe(false);

  });

  test("re-submitting status: paid on an already-paid invoice does not re-send the review request", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AutoReviewNoDupe");
    const customerId = await createCustomer(app, authHeader, { name: "No Dupe Customer", email: "nodupe@test.com" });

    await setReviewLink(app, authHeader, "https://g.page/r/example/review");

    const invoice = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        type: "invoice",
        items: [{ description: "Job", quantity: 1, unit_price: 200 }]
      });

    const firstPaid = await request(app)
      .patch(`/api/quotes/${invoice.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "paid" });

    expect(firstPaid.body.review_request_sent).toBe(true);

    const secondPaid = await request(app)
      .patch(`/api/quotes/${invoice.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "paid" });

    expect(secondPaid.status).toBe(200);
    expect(secondPaid.body.review_request_sent).toBe(false);

    const history = await request(app)
      .get(`/api/review-requests/customer/${customerId}`)
      .set("Authorization", authHeader);

    expect(history.body.length).toBe(1);

  });

  test("marking an invoice paid with no customer email or no review link quietly does not send, and does not fail the update", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AutoReviewMissing");
    const customerId = await createCustomer(app, authHeader, { name: "No Email Customer" });

    const invoice = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        type: "invoice",
        items: [{ description: "Job", quantity: 1, unit_price: 200 }]
      });

    const paid = await request(app)
      .patch(`/api/quotes/${invoice.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "paid" });

    expect(paid.status).toBe(200);
    expect(paid.body.review_request_sent).toBe(false);

    const fetched = await request(app)
      .get(`/api/quotes/${invoice.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched.body.status).toBe("paid");

  });

});
