const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");

describe("Customer tags", () => {

  test("create, list, and delete a tag all work and are scoped to business_id", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "TagCrud");

    const created = await request(app)
      .post("/api/tags")
      .set("Authorization", authHeader)
      .send({ name: "VIP" });

    expect(created.status).toBe(201);
    expect(created.body.id).toBeTruthy();

    const list = await request(app)
      .get("/api/tags")
      .set("Authorization", authHeader);

    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);
    expect(list.body[0].name).toBe("VIP");
    expect(list.body[0].business_id).toBe(business_id);

    const deleted = await request(app)
      .delete(`/api/tags/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(deleted.status).toBe(200);

    const afterDelete = await request(app)
      .get("/api/tags")
      .set("Authorization", authHeader);

    expect(afterDelete.body).toHaveLength(0);

  });


  test("a business cannot see or delete another business's tags (404, not silent success)", async () => {

    const bizA = await createBusinessAndUser(app, "TagIsoA");
    const bizB = await createBusinessAndUser(app, "TagIsoB");

    const created = await request(app)
      .post("/api/tags")
      .set("Authorization", bizA.authHeader)
      .send({ name: "Recurring" });

    const listB = await request(app)
      .get("/api/tags")
      .set("Authorization", bizB.authHeader);

    expect(listB.status).toBe(200);
    expect(listB.body).toHaveLength(0);

    const deleteAttempt = await request(app)
      .delete(`/api/tags/${created.body.id}`)
      .set("Authorization", bizB.authHeader);

    expect(deleteAttempt.status).toBe(404);

    const stillThere = await request(app)
      .get("/api/tags")
      .set("Authorization", bizA.authHeader);

    expect(stillThere.body).toHaveLength(1);

  });


  test("creating a duplicate tag name for the same business is rejected with a clear error", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TagDup");

    const first = await request(app)
      .post("/api/tags")
      .set("Authorization", authHeader)
      .send({ name: "VIP" });

    expect(first.status).toBe(201);

    // Different casing should still be treated as the same tag name.
    const duplicate = await request(app)
      .post("/api/tags")
      .set("Authorization", authHeader)
      .send({ name: "vip" });

    expect(duplicate.status).toBe(400);
    expect(duplicate.body.error).toBeTruthy();

    const list = await request(app)
      .get("/api/tags")
      .set("Authorization", authHeader);

    expect(list.body).toHaveLength(1);

  });


  test("empty tag name is rejected with 400", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TagEmptyName");

    const blank = await request(app)
      .post("/api/tags")
      .set("Authorization", authHeader)
      .send({ name: "   " });

    expect(blank.status).toBe(400);

    const missing = await request(app)
      .post("/api/tags")
      .set("Authorization", authHeader)
      .send({});

    expect(missing.status).toBe(400);

  });


  test("a customer with no tags returns an empty tags array, not null/undefined/an error", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TagNoneOnCustomer");

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Untagged Customer" });

    const customer_id = customerRes.body.id;

    const fetched = await request(app)
      .get(`/api/customers/${customer_id}`)
      .set("Authorization", authHeader);

    expect(fetched.status).toBe(200);
    expect(Array.isArray(fetched.body.tags)).toBe(true);
    expect(fetched.body.tags).toHaveLength(0);

    const list = await request(app)
      .get("/api/customers")
      .set("Authorization", authHeader);

    expect(Array.isArray(list.body[0].tags)).toBe(true);
    expect(list.body[0].tags).toHaveLength(0);

  });


  test("assigning a tag to a customer makes it appear in that customer's data, and it can be removed again", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TagAssign");

    const tagRes = await request(app)
      .post("/api/tags")
      .set("Authorization", authHeader)
      .send({ name: "VIP" });

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Jane Homeowner" });

    const customer_id = customerRes.body.id;
    const tag_id = tagRes.body.id;

    const assign = await request(app)
      .post(`/api/customers/${customer_id}/tags`)
      .set("Authorization", authHeader)
      .send({ tag_id });

    expect(assign.status).toBe(201);
    expect(assign.body.tags).toHaveLength(1);
    expect(assign.body.tags[0]).toMatchObject({ id: tag_id, name: "VIP" });

    const fetched = await request(app)
      .get(`/api/customers/${customer_id}`)
      .set("Authorization", authHeader);

    expect(fetched.body.tags).toHaveLength(1);
    expect(fetched.body.tags[0]).toMatchObject({ id: tag_id, name: "VIP" });

    const remove = await request(app)
      .delete(`/api/customers/${customer_id}/tags/${tag_id}`)
      .set("Authorization", authHeader);

    expect(remove.status).toBe(200);
    expect(remove.body.tags).toHaveLength(0);

    const afterRemove = await request(app)
      .get(`/api/customers/${customer_id}`)
      .set("Authorization", authHeader);

    expect(afterRemove.body.tags).toHaveLength(0);

  });


  test("assigning a tag to a customer that doesn't exist, or a tag that doesn't exist, returns 404", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TagAssign404");

    const tagRes = await request(app)
      .post("/api/tags")
      .set("Authorization", authHeader)
      .send({ name: "VIP" });

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Jane Homeowner" });

    const missingCustomer = await request(app)
      .post(`/api/customers/does-not-exist/tags`)
      .set("Authorization", authHeader)
      .send({ tag_id: tagRes.body.id });

    expect(missingCustomer.status).toBe(404);

    const missingTag = await request(app)
      .post(`/api/customers/${customerRes.body.id}/tags`)
      .set("Authorization", authHeader)
      .send({ tag_id: "does-not-exist" });

    expect(missingTag.status).toBe(404);

  });


  test("a business cannot assign its tag to another business's customer, or vice versa", async () => {

    const bizA = await createBusinessAndUser(app, "TagCrossA");
    const bizB = await createBusinessAndUser(app, "TagCrossB");

    const tagA = await request(app)
      .post("/api/tags")
      .set("Authorization", bizA.authHeader)
      .send({ name: "VIP" });

    const customerB = await request(app)
      .post("/api/customers")
      .set("Authorization", bizB.authHeader)
      .send({ name: "Business B Customer" });

    // Business A trying to tag business B's customer with its own tag.
    const crossAssign = await request(app)
      .post(`/api/customers/${customerB.body.id}/tags`)
      .set("Authorization", bizA.authHeader)
      .send({ tag_id: tagA.body.id });

    expect(crossAssign.status).toBe(404);

    // Business B trying to use business A's tag on its own customer.
    const crossTag = await request(app)
      .post(`/api/customers/${customerB.body.id}/tags`)
      .set("Authorization", bizB.authHeader)
      .send({ tag_id: tagA.body.id });

    expect(crossTag.status).toBe(404);

  });


  test("deleting a tag removes it from every customer that had it (cascade)", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TagCascade");

    const tagRes = await request(app)
      .post("/api/tags")
      .set("Authorization", authHeader)
      .send({ name: "Recurring" });

    const tag_id = tagRes.body.id;

    const customer1 = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Customer One" });

    const customer2 = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Customer Two" });

    await request(app)
      .post(`/api/customers/${customer1.body.id}/tags`)
      .set("Authorization", authHeader)
      .send({ tag_id });

    await request(app)
      .post(`/api/customers/${customer2.body.id}/tags`)
      .set("Authorization", authHeader)
      .send({ tag_id });

    const deleteTag = await request(app)
      .delete(`/api/tags/${tag_id}`)
      .set("Authorization", authHeader);

    expect(deleteTag.status).toBe(200);

    const fetched1 = await request(app)
      .get(`/api/customers/${customer1.body.id}`)
      .set("Authorization", authHeader);

    const fetched2 = await request(app)
      .get(`/api/customers/${customer2.body.id}`)
      .set("Authorization", authHeader);

    expect(fetched1.body.tags).toHaveLength(0);
    expect(fetched2.body.tags).toHaveLength(0);

  });


  test("filtering the customer list by tag_id returns only the matching customers", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TagFilter");

    const vipTag = await request(app)
      .post("/api/tags")
      .set("Authorization", authHeader)
      .send({ name: "VIP" });

    const oneTimeTag = await request(app)
      .post("/api/tags")
      .set("Authorization", authHeader)
      .send({ name: "One-time" });

    const vipCustomer = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "VIP Customer" });

    const oneTimeCustomer = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "One-time Customer" });

    await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Untagged Customer" });

    await request(app)
      .post(`/api/customers/${vipCustomer.body.id}/tags`)
      .set("Authorization", authHeader)
      .send({ tag_id: vipTag.body.id });

    await request(app)
      .post(`/api/customers/${oneTimeCustomer.body.id}/tags`)
      .set("Authorization", authHeader)
      .send({ tag_id: oneTimeTag.body.id });

    const filtered = await request(app)
      .get(`/api/customers?tag_id=${vipTag.body.id}`)
      .set("Authorization", authHeader);

    expect(filtered.status).toBe(200);
    expect(filtered.body).toHaveLength(1);
    expect(filtered.body[0].id).toBe(vipCustomer.body.id);

    const unfiltered = await request(app)
      .get("/api/customers")
      .set("Authorization", authHeader);

    expect(unfiltered.body).toHaveLength(3);

  });

});
