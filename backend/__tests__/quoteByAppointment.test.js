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


// Powers Today.jsx's "Sign On-Site" button - given a job, is there a
// quote linked to it that's actually ready to sign right now? The only
// real path a quote gets linked to an appointment today is the
// auto-drafted invoice created when a job is marked completed (see
// appointmentController.js) - so that's the real flow exercised here,
// not a synthetic direct link.
describe("GET /api/quotes/by-appointment/:appointmentId", () => {

  test("an appointment with no linked quote returns null, not a 404", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QbaNoQuote");
    const customerId = await createCustomer(authHeader, "No Quote Customer");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Roof inspection",
        start_time: "2026-09-01T10:00:00.000Z",
        customer_id: customerId
      });

    const res = await request(app)
      .get(`/api/quotes/by-appointment/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();

  });


  test("a completed appointment's auto-drafted invoice shows up once it's sent", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QbaSent");
    const customerId = await createCustomer(authHeader, "Sent Quote Customer");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Gutter repair",
        start_time: "2026-09-01T10:00:00.000Z",
        customer_id: customerId
      });

    const appointmentId = created.body.id;

    const completed = await request(app)
      .patch(`/api/appointments/${appointmentId}`)
      .set("Authorization", authHeader)
      .send({ status: "completed" });

    const invoiceId = completed.body.draft_invoice_id;
    expect(invoiceId).toBeTruthy();

    // Still a draft at this point - not yet ready to sign.
    const beforeSend = await request(app)
      .get(`/api/quotes/by-appointment/${appointmentId}`)
      .set("Authorization", authHeader);

    expect(beforeSend.status).toBe(200);
    expect(beforeSend.body.id).toBe(invoiceId);
    expect(beforeSend.body.status).toBe("draft");

    await request(app)
      .patch(`/api/quotes/${invoiceId}`)
      .set("Authorization", authHeader)
      .send({ status: "sent" });

    const afterSend = await request(app)
      .get(`/api/quotes/by-appointment/${appointmentId}`)
      .set("Authorization", authHeader);

    expect(afterSend.status).toBe(200);
    expect(afterSend.body.id).toBe(invoiceId);
    expect(afterSend.body.status).toBe("sent");
    expect(afterSend.body.type).toBe("invoice");

    // Auto-drafted invoices are never "Good/Better/Best" quotes -
    // Today.jsx's Sign On-Site button relies on this to know a plain
    // signature flow (not a tier picker) is all that's needed here.
    expect(!!afterSend.body.has_tiers).toBe(false);

  });


  test("a business can't look up another business's quote through this endpoint", async () => {

    const businessA = await createBusinessAndUser(app, "QbaScopeA");
    const businessB = await createBusinessAndUser(app, "QbaScopeB");

    const customerId = await createCustomer(businessA.authHeader, "Scope Customer");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", businessA.authHeader)
      .send({
        title: "Fence repair",
        start_time: "2026-09-01T10:00:00.000Z",
        customer_id: customerId
      });

    await request(app)
      .patch(`/api/appointments/${created.body.id}`)
      .set("Authorization", businessA.authHeader)
      .send({ status: "completed" });

    const crossBusiness = await request(app)
      .get(`/api/quotes/by-appointment/${created.body.id}`)
      .set("Authorization", businessB.authHeader);

    expect(crossBusiness.status).toBe(200);
    expect(crossBusiness.body).toBeNull();

  });

});
