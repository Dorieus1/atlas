const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");


const createCustomer = async (authHeader, name, email, phone) => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name, email, phone });

  return res.body.id;

};


describe("Possible duplicate customers", () => {

  test("two customers with the exact same name are flagged as a possible duplicate", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DupName");

    const idA = await createCustomer(authHeader, "Jhene Lo", null, "6023002312");
    const idB = await createCustomer(authHeader, "jhene lo", null, "6025550199");

    const res = await request(app)
      .get("/api/customers/duplicates")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].reasons).toEqual(["same name"]);

    const ids = res.body[0].customers.map((c) => c.id).sort();
    expect(ids).toEqual([idA, idB].sort());

  });


  test("phone numbers match regardless of formatting", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DupPhone");

    await createCustomer(authHeader, "Customer One", null, "(602) 300-2312");
    await createCustomer(authHeader, "Customer Two", null, "602-300-2312");

    const res = await request(app)
      .get("/api/customers/duplicates")
      .set("Authorization", authHeader);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].reasons).toEqual(["same phone"]);

  });


  test("a customer sharing both a name and an email with another shows up once, with both reasons", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DupBoth");

    await createCustomer(authHeader, "Same Person", "same@test.com", null);
    await createCustomer(authHeader, "Same Person", "same@test.com", null);

    const res = await request(app)
      .get("/api/customers/duplicates")
      .set("Authorization", authHeader);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].reasons.sort()).toEqual(["same email", "same name"]);
    expect(res.body[0].customers).toHaveLength(2);

  });


  test("customers with nothing in common are never flagged", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DupNone");

    await createCustomer(authHeader, "Alice Anderson", "alice@test.com", "5551110000");
    await createCustomer(authHeader, "Bob Brown", "bob@test.com", "5552220000");

    const res = await request(app)
      .get("/api/customers/duplicates")
      .set("Authorization", authHeader);

    expect(res.body).toEqual([]);

  });


  test("a trashed customer is never matched against an active one", async () => {

    const { authHeader } = await createBusinessAndUser(app, "DupTrashed");

    const activeId = await createCustomer(authHeader, "Trash Match", "trashmatch@test.com", null);
    const trashedId = await createCustomer(authHeader, "Trash Match", "trashmatch@test.com", null);

    await request(app)
      .delete(`/api/customers/${trashedId}`)
      .set("Authorization", authHeader);

    const res = await request(app)
      .get("/api/customers/duplicates")
      .set("Authorization", authHeader);

    expect(res.body).toEqual([]);

    // Sanity check the active one is still there and untouched.
    const detail = await request(app)
      .get(`/api/customers/${activeId}`)
      .set("Authorization", authHeader);

    expect(detail.status).toBe(200);

  });


  test("duplicates never leak across businesses", async () => {

    const bizA = await createBusinessAndUser(app, "DupTenantA");
    const bizB = await createBusinessAndUser(app, "DupTenantB");

    await createCustomer(bizA.authHeader, "Shared Name", null, null);
    await createCustomer(bizA.authHeader, "Shared Name", null, null);
    await createCustomer(bizB.authHeader, "Shared Name", null, null);

    const resA = await request(app)
      .get("/api/customers/duplicates")
      .set("Authorization", bizA.authHeader);

    expect(resA.body).toHaveLength(1);
    expect(resA.body[0].customers).toHaveLength(2);

  });

});
