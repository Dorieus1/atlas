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

describe("Notes", () => {

  test("whitespace-only note is rejected, and content gets trimmed", async () => {

    const { authHeader } = await createBusinessAndUser(app, "NoteValidation");
    const customerId = await createCustomer(app, authHeader, "Note Customer");

    const blank = await request(app)
      .post("/api/notes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, note: "   " });

    expect(blank.status).toBe(400);

    const padded = await request(app)
      .post("/api/notes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, note: "  Called them back  " });

    expect(padded.status).toBe(200);

    const list = await request(app)
      .get(`/api/notes/${customerId}`)
      .set("Authorization", authHeader);

    expect(list.body).toHaveLength(1);
    expect(list.body[0].note).toBe("Called them back");

  });

  test("one business cannot edit or delete another business's note", async () => {

    const bizA = await createBusinessAndUser(app, "NoteIsoA");
    const bizB = await createBusinessAndUser(app, "NoteIsoB");

    const customerId = await createCustomer(app, bizA.authHeader, "A's Customer");

    const created = await request(app)
      .post("/api/notes")
      .set("Authorization", bizA.authHeader)
      .send({ customer_id: customerId, note: "original note" });

    const notes = await request(app)
      .get(`/api/notes/${customerId}`)
      .set("Authorization", bizA.authHeader);

    const noteId = notes.body[0].id;

    const editAttempt = await request(app)
      .put(`/api/notes/${noteId}`)
      .set("Authorization", bizB.authHeader)
      .send({ note: "hacked" });

    expect(editAttempt.status).toBe(404);

    const deleteAttempt = await request(app)
      .delete(`/api/notes/${noteId}`)
      .set("Authorization", bizB.authHeader);

    expect(deleteAttempt.status).toBe(404);

    const stillThere = await request(app)
      .get(`/api/notes/${customerId}`)
      .set("Authorization", bizA.authHeader);

    expect(stillThere.body[0].note).toBe("original note");

  });

  test("editing and deleting your own note works", async () => {

    const { authHeader } = await createBusinessAndUser(app, "NoteEdit");
    const customerId = await createCustomer(app, authHeader, "Edit Note Customer");

    await request(app)
      .post("/api/notes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, note: "first draft" });

    const notes = await request(app)
      .get(`/api/notes/${customerId}`)
      .set("Authorization", authHeader);

    const noteId = notes.body[0].id;

    const edit = await request(app)
      .put(`/api/notes/${noteId}`)
      .set("Authorization", authHeader)
      .send({ note: "final version" });

    expect(edit.status).toBe(200);

    const afterEdit = await request(app)
      .get(`/api/notes/${customerId}`)
      .set("Authorization", authHeader);

    expect(afterEdit.body[0].note).toBe("final version");

    const del = await request(app)
      .delete(`/api/notes/${noteId}`)
      .set("Authorization", authHeader);

    expect(del.status).toBe(200);

    const afterDelete = await request(app)
      .get(`/api/notes/${customerId}`)
      .set("Authorization", authHeader);

    expect(afterDelete.body).toHaveLength(0);

  });

});
