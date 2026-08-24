const request = require("supertest");
const app = require("../server");
const db = require("../../database/db");
const { createBusinessAndUser } = require("./setup/helpers");


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


describe("Customer portal", () => {

  beforeEach(() => {
    global.fetch.mockClear();
  });


  test("looking up a business by slug works, and an unknown slug 404s", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PortalLookup");
    const slug = await getSlug(authHeader);

    const found = await request(app).get(`/api/portal/${slug}`);

    expect(found.status).toBe(200);
    expect(found.body.name).toBe("PortalLookup Business");

    const missing = await request(app).get("/api/portal/no-such-business");

    expect(missing.status).toBe(404);

  });


  test("requesting a login link for an unknown email gives the same generic response and sends nothing", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PortalUnknown");
    const slug = await getSlug(authHeader);

    const res = await request(app)
      .post(`/api/portal/${slug}/login`)
      .send({ email: "nobody@test.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if that email is on file/i);
    expect(global.fetch).not.toHaveBeenCalled();

  });


  test("a full magic-link login: request, extract the token, verify, then use the customer session", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PortalFlow");
    const slug = await getSlug(authHeader);

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Portal Customer", email: "portal.customer@test.com" });

    const loginReq = await request(app)
      .post(`/api/portal/${slug}/login`)
      .send({ email: "portal.customer@test.com" });

    expect(loginReq.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const token = extractToken();
    expect(token).toBeTruthy();

    const verify = await request(app)
      .post(`/api/portal/${slug}/verify`)
      .send({ token });

    expect(verify.status).toBe(200);
    expect(verify.body.customer.id).toBe(customerRes.body.id);
    expect(verify.body.business.name).toBe("PortalFlow Business");

    const customerAuthHeader = `Bearer ${verify.body.token}`;

    const me = await request(app)
      .get("/api/portal/account/me")
      .set("Authorization", customerAuthHeader);

    expect(me.status).toBe(200);
    expect(me.body.id).toBe(customerRes.body.id);
    expect(me.body.email).toBe("portal.customer@test.com");

  });


  test("a login link token can only be used once", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PortalReuse");
    const slug = await getSlug(authHeader);

    await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Reuse Customer", email: "reuse@test.com" });

    await request(app)
      .post(`/api/portal/${slug}/login`)
      .send({ email: "reuse@test.com" });

    const token = extractToken();

    const first = await request(app)
      .post(`/api/portal/${slug}/verify`)
      .send({ token });

    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/portal/${slug}/verify`)
      .send({ token });

    expect(second.status).toBe(400);

  });


  test("a valid token can't be verified against a different business's slug", async () => {

    const bizA = await createBusinessAndUser(app, "PortalCrossA");
    const bizB = await createBusinessAndUser(app, "PortalCrossB");

    const slugA = await getSlug(bizA.authHeader);
    const slugB = await getSlug(bizB.authHeader);

    await request(app)
      .post("/api/customers")
      .set("Authorization", bizA.authHeader)
      .send({ name: "Cross Customer", email: "cross@test.com" });

    await request(app)
      .post(`/api/portal/${slugA}/login`)
      .send({ email: "cross@test.com" });

    const token = extractToken();

    const wrongBusiness = await request(app)
      .post(`/api/portal/${slugB}/verify`)
      .send({ token });

    expect(wrongBusiness.status).toBe(400);

  });


  test("account routes reject requests with no token, and reject a business owner's token", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PortalWrongToken");

    const noToken = await request(app).get("/api/portal/account/me");
    expect(noToken.status).toBe(401);

    const ownerToken = await request(app)
      .get("/api/portal/account/me")
      .set("Authorization", authHeader);

    expect(ownerToken.status).toBe(401);

  });


  test("a customer's portal session shows their own appointments, quotes, and photos", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PortalData");
    const slug = await getSlug(authHeader);

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Data Customer", email: "data@test.com" });

    const customerId = customerRes.body.id;

    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        title: "Roof inspection",
        start_time: "2026-09-01T10:00:00.000Z"
      });

    await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        type: "quote",
        items: [{ description: "New gutters", quantity: 1, unit_price: 500 }]
      });

    await request(app)
      .post(`/api/portal/${slug}/login`)
      .send({ email: "data@test.com" });

    const token = extractToken();

    const verify = await request(app)
      .post(`/api/portal/${slug}/verify`)
      .send({ token });

    const customerAuthHeader = `Bearer ${verify.body.token}`;

    const appointments = await request(app)
      .get("/api/portal/account/appointments")
      .set("Authorization", customerAuthHeader);

    expect(appointments.status).toBe(200);
    expect(appointments.body.length).toBe(1);
    expect(appointments.body[0].title).toBe("Roof inspection");

    const quotes = await request(app)
      .get("/api/portal/account/quotes")
      .set("Authorization", customerAuthHeader);

    expect(quotes.status).toBe(200);
    expect(quotes.body.length).toBe(1);
    expect(quotes.body[0].total).toBe(500);

    const photos = await request(app)
      .get("/api/portal/account/photos")
      .set("Authorization", customerAuthHeader);

    expect(photos.status).toBe(200);
    expect(photos.body.length).toBe(0);

  });


  test("deleting a customer also removes their portal login tokens", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PortalCascade");
    const slug = await getSlug(authHeader);

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Cascade Customer", email: "portalcascade@test.com" });

    await request(app)
      .post(`/api/portal/${slug}/login`)
      .send({ email: "portalcascade@test.com" });

    await request(app)
      .delete(`/api/customers/${customerRes.body.id}`)
      .set("Authorization", authHeader);

    const remaining = await new Promise((resolve, reject) => {
      db.all(
        "SELECT id FROM portal_login_tokens WHERE customer_id = ?",
        [customerRes.body.id],
        (err, rows) => (err ? reject(err) : resolve(rows))
      );
    });

    expect(remaining.length).toBe(0);

  });

});
