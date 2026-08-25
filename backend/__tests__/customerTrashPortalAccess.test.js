const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");
const { createLoginToken } = require("../services/portalAuthService");


// Trashing a customer must actually cut off their portal access, not just
// hide them from the business's own customer list. This file proves the
// fix for a real bug: getCustomerById/getCustomerByEmail (used almost
// everywhere, including customer-portal auth) were never updated to
// exclude soft-deleted rows, so a trashed customer kept full working
// portal access - an existing session, a fresh magic-link login, viewing
// their data, and paying invoices via Stripe checkout - indefinitely.


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


describe("Trashing a customer cuts off their portal access", () => {

  beforeEach(() => {
    global.fetch.mockClear();
  });


  test("an existing portal session stops working on the very next request after the customer is trashed", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TrashPortalSession");
    const slug = await getSlug(authHeader);

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Trashed Portal Customer", email: "trashedportal@test.com" });

    const customerAuthHeader = await loginAsCustomer(slug, "trashedportal@test.com");

    const before = await request(app)
      .get("/api/portal/account/me")
      .set("Authorization", customerAuthHeader);

    expect(before.status).toBe(200);

    await request(app)
      .delete(`/api/customers/${customerRes.body.id}`)
      .set("Authorization", authHeader);

    const after = await request(app)
      .get("/api/portal/account/me")
      .set("Authorization", customerAuthHeader);

    expect(after.status).toBe(401);

  });


  test("a trashed customer requesting a fresh magic link gets no login email sent", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TrashPortalRequest");
    const slug = await getSlug(authHeader);

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Trashed Requester", email: "trashedrequester@test.com" });

    await request(app)
      .delete(`/api/customers/${customerRes.body.id}`)
      .set("Authorization", authHeader);

    const loginReq = await request(app)
      .post(`/api/portal/${slug}/login`)
      .send({ email: "trashedrequester@test.com" });

    // Same generic response as a truly unknown email - no information
    // leak about whether the email belongs to a trashed customer.
    expect(loginReq.status).toBe(200);
    expect(global.fetch).not.toHaveBeenCalled();

  });


  test("a magic-link token requested just before the customer was trashed can't be consumed afterward", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "TrashPortalConsume");
    const slug = await getSlug(authHeader);

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Trashed Before Consume", email: "trashedconsume@test.com" });

    // Mint a valid, unconsumed login token directly (simulating a token
    // that was requested moments before the customer got trashed).
    const token = await createLoginToken(customerRes.body.id, business_id);

    await request(app)
      .delete(`/api/customers/${customerRes.body.id}`)
      .set("Authorization", authHeader);

    const verify = await request(app)
      .post(`/api/portal/${slug}/verify`)
      .send({ token });

    expect(verify.status).toBe(404);

  });


  test("re-importing a CSV with a trashed customer's email creates a fresh active customer instead of skipping it as a duplicate", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TrashPortalImport");

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Trashed Then Reimported", email: "reimport@test.com" });

    await request(app)
      .delete(`/api/customers/${customerRes.body.id}`)
      .set("Authorization", authHeader);

    const csv = "Name,Email\nReimported Customer,reimport@test.com\n";

    const importRes = await request(app)
      .post("/api/customers/import")
      .set("Authorization", authHeader)
      .attach("file", Buffer.from(csv), "customers.csv");

    expect(importRes.status).toBe(200);
    expect(importRes.body.created).toBe(1);
    expect(importRes.body.skipped_duplicates).toHaveLength(0);

    const list = await request(app)
      .get("/api/customers")
      .set("Authorization", authHeader);

    const activeMatch = list.body.filter((c) => c.email === "reimport@test.com");

    expect(activeMatch).toHaveLength(1);
    expect(activeMatch[0].id).not.toBe(customerRes.body.id);

  });

});
