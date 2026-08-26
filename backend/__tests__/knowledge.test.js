const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");

describe("Knowledge", () => {

  test("business_id is taken from the token, not the request body", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "KBOwnership");

    const created = await request(app)
      .post("/api/knowledge")
      .set("Authorization", authHeader)
      .send({
        business_id: "someone-elses-business-id",
        title: "Hours",
        content: "9-5"
      });

    expect(created.status).toBe(201);

    const list = await request(app)
      .get(`/api/knowledge/${business_id}`)
      .set("Authorization", authHeader);

    expect(list.body).toHaveLength(1);
    expect(list.body[0].business_id).toBe(business_id);

  });

  test("whitespace-only title/content is rejected, and values get trimmed", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "KBValidation");

    const blank = await request(app)
      .post("/api/knowledge")
      .set("Authorization", authHeader)
      .send({ title: "   ", content: "   " });

    expect(blank.status).toBe(400);

    const padded = await request(app)
      .post("/api/knowledge")
      .set("Authorization", authHeader)
      .send({ title: "  Warranty  ", content: "  10 years  " });

    expect(padded.status).toBe(201);

    const list = await request(app)
      .get(`/api/knowledge/${business_id}`)
      .set("Authorization", authHeader);

    expect(list.body[0].title).toBe("Warranty");
    expect(list.body[0].content).toBe("10 years");

  });

  test("a business cannot read another business's knowledge base directly", async () => {

    const bizA = await createBusinessAndUser(app, "KBIsoA");
    const bizB = await createBusinessAndUser(app, "KBIsoB");

    const attempt = await request(app)
      .get(`/api/knowledge/${bizA.business_id}`)
      .set("Authorization", bizB.authHeader);

    expect(attempt.status).toBe(403);

  });

  test("one business cannot edit or delete another business's knowledge entry", async () => {

    const bizA = await createBusinessAndUser(app, "KBEditIsoA");
    const bizB = await createBusinessAndUser(app, "KBEditIsoB");

    const created = await request(app)
      .post("/api/knowledge")
      .set("Authorization", bizA.authHeader)
      .send({ title: "Hours", content: "9-5" });

    const editAttempt = await request(app)
      .put(`/api/knowledge/${created.body.id}`)
      .set("Authorization", bizB.authHeader)
      .send({ title: "Hacked", content: "Hacked" });

    expect(editAttempt.status).toBe(404);

    const deleteAttempt = await request(app)
      .delete(`/api/knowledge/${created.body.id}`)
      .set("Authorization", bizB.authHeader);

    expect(deleteAttempt.status).toBe(404);

    const stillThere = await request(app)
      .get(`/api/knowledge/${bizA.business_id}`)
      .set("Authorization", bizA.authHeader);

    expect(stillThere.body[0].title).toBe("Hours");

  });

  test("editing and deleting your own knowledge entry works", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "KBEdit");

    const created = await request(app)
      .post("/api/knowledge")
      .set("Authorization", authHeader)
      .send({ title: "Original", content: "Original content" });

    const edit = await request(app)
      .put(`/api/knowledge/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ title: "Updated", content: "Updated content" });

    expect(edit.status).toBe(200);

    const afterEdit = await request(app)
      .get(`/api/knowledge/${business_id}`)
      .set("Authorization", authHeader);

    expect(afterEdit.body[0].title).toBe("Updated");

    const del = await request(app)
      .delete(`/api/knowledge/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(del.status).toBe(200);

    const afterDelete = await request(app)
      .get(`/api/knowledge/${business_id}`)
      .set("Authorization", authHeader);

    expect(afterDelete.body).toHaveLength(0);

  });

  test("a category is saved on create, trimmed, and can be changed on update", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "KBCategory");

    const created = await request(app)
      .post("/api/knowledge")
      .set("Authorization", authHeader)
      .send({ title: "Hours", content: "9-5", category: "  Hours & Location  " });

    expect(created.status).toBe(201);

    const afterCreate = await request(app)
      .get(`/api/knowledge/${business_id}`)
      .set("Authorization", authHeader);

    expect(afterCreate.body[0].category).toBe("Hours & Location");

    await request(app)
      .put(`/api/knowledge/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ title: "Hours", content: "9-5", category: "Policies" });

    const afterUpdate = await request(app)
      .get(`/api/knowledge/${business_id}`)
      .set("Authorization", authHeader);

    expect(afterUpdate.body[0].category).toBe("Policies");

  });

  test("an entry with no category on file is returned as null, not an empty string", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "KBNoCategory");

    await request(app)
      .post("/api/knowledge")
      .set("Authorization", authHeader)
      .send({ title: "Hours", content: "9-5" });

    const list = await request(app)
      .get(`/api/knowledge/${business_id}`)
      .set("Authorization", authHeader);

    expect(list.body[0].category).toBeNull();

  });

});
