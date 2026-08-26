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


const createQuote = async (authHeader, customerId) => {

  const res = await request(app)
    .post("/api/quotes")
    .set("Authorization", authHeader)
    .send({
      customer_id: customerId,
      items: [{ description: "Roof inspection", quantity: 1, unit_price: 150 }]
    });

  return res.body.id;

};


const lastEmail = () => {

  const lastCall = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
  return JSON.parse(lastCall[1].body);

};


beforeEach(() => {
  global.fetch.mockClear();
});


describe("Send quote to customer", () => {

  test("a quote with an unpaid deposit mentions it in the email; one with no deposit doesn't", async () => {

    const { authHeader } = await createBusinessAndUser(app, "SendQuoteDeposit");
    const customerId = await createCustomer(authHeader, "Deposit Send Customer", "depositsend@test.com");

    const withDeposit = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        items: [{ description: "Roof inspection", quantity: 1, unit_price: 1000 }],
        deposit_type: "fixed",
        deposit_value: 200
      });

    await request(app)
      .post(`/api/quotes/${withDeposit.body.id}/send`)
      .set("Authorization", authHeader);

    expect(lastEmail().html).toContain("deposit of $200.00 is required");

    const withoutDeposit = await createQuote(authHeader, customerId);

    await request(app)
      .post(`/api/quotes/${withoutDeposit}/send`)
      .set("Authorization", authHeader);

    // Checks the specific added phrase, not the bare word "deposit" - the
    // portal URL embeds the business's own slug, and a business (or in
    // this test, a fixture) named anything containing "deposit" would
    // otherwise trip a bare substring check via its own URL, which has
    // nothing to do with whether the deposit paragraph was added.
    expect(lastEmail().html).not.toContain("is required to get started");

  });


  test("sending a draft emails the customer, bumps it to sent, and the emailed link logs them into the portal", async () => {

    const { authHeader } = await createBusinessAndUser(app, "SendQuoteFlow");
    const customerId = await createCustomer(authHeader, "Send Customer", "sendquote@test.com");
    const quoteId = await createQuote(authHeader, customerId);

    const res = await request(app)
      .post(`/api/quotes/${quoteId}/send`)
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const email = lastEmail();
    expect(email.to).toEqual(["sendquote@test.com"]);
    expect(email.subject).toMatch(/\$150\.00/);

    const detail = await request(app)
      .get(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader);

    expect(detail.body.status).toBe("sent");

    // The link in the email is a real, working portal login token, not
    // just a plausible-looking URL.
    const token = email.html.match(/token=([a-f0-9]+)/)[1];
    const slug = await getSlugFor(authHeader);

    const verify = await request(app)
      .post(`/api/portal/${slug}/verify`)
      .send({ token });

    expect(verify.status).toBe(200);
    expect(verify.body.token).toBeTruthy();

  });


  test("a customer with no email on file can't be sent a quote, and nothing is emailed", async () => {

    const { authHeader } = await createBusinessAndUser(app, "SendQuoteNoEmail");
    const customerId = await createCustomer(authHeader, "No Email Customer", null);
    const quoteId = await createQuote(authHeader, customerId);

    const res = await request(app)
      .post(`/api/quotes/${quoteId}/send`)
      .set("Authorization", authHeader);

    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();

  });


  test("re-sending an already-accepted quote emails again but doesn't roll its status back to sent", async () => {

    const { authHeader } = await createBusinessAndUser(app, "SendQuoteResend");
    const customerId = await createCustomer(authHeader, "Resend Customer", "resend@test.com");
    const quoteId = await createQuote(authHeader, customerId);

    await request(app)
      .patch(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader)
      .send({ status: "accepted" });

    const res = await request(app)
      .post(`/api/quotes/${quoteId}/send`)
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const detail = await request(app)
      .get(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader);

    expect(detail.body.status).toBe("accepted");

  });


  test("if the email actually fails to send, the quote is NOT marked sent - a failed send must not look like a successful one", async () => {

    const { authHeader } = await createBusinessAndUser(app, "SendQuoteEmailFails");
    const customerId = await createCustomer(authHeader, "Fails Customer", "fails@test.com");
    const quoteId = await createQuote(authHeader, customerId);

    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: "Resend rejected this" })
    });

    const res = await request(app)
      .post(`/api/quotes/${quoteId}/send`)
      .set("Authorization", authHeader);

    expect(res.status).toBe(500);

    const detail = await request(app)
      .get(`/api/quotes/${quoteId}`)
      .set("Authorization", authHeader);

    expect(detail.body.status).toBe("draft");

  });


  test("sending a quote that doesn't exist (or belongs to another business) 404s", async () => {

    const bizA = await createBusinessAndUser(app, "SendQuoteA");
    const bizB = await createBusinessAndUser(app, "SendQuoteB");

    const customerId = await createCustomer(bizA.authHeader, "A Customer", "senda@test.com");
    const quoteId = await createQuote(bizA.authHeader, customerId);

    const res = await request(app)
      .post(`/api/quotes/${quoteId}/send`)
      .set("Authorization", bizB.authHeader);

    expect(res.status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();

  });

});


async function getSlugFor(authHeader) {

  const res = await request(app)
    .get("/api/business")
    .set("Authorization", authHeader);

  return res.body[0].slug;

}
