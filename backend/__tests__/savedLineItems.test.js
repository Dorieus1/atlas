const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");

describe("Saved line items", () => {

  test("create, list, update, and delete all work and are scoped to business_id from the token", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "SLICrud");

    const created = await request(app)
      .post("/api/saved-line-items")
      .set("Authorization", authHeader)
      .send({ description: "Roof inspection", unit_price: 150 });

    expect(created.status).toBe(201);
    expect(created.body.id).toBeTruthy();

    const list = await request(app)
      .get("/api/saved-line-items")
      .set("Authorization", authHeader);

    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);
    expect(list.body[0].description).toBe("Roof inspection");
    expect(list.body[0].unit_price).toBe(150);
    expect(list.body[0].business_id).toBe(business_id);

    const updated = await request(app)
      .put(`/api/saved-line-items/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ description: "Roof inspection (detailed)", unit_price: 175 });

    expect(updated.status).toBe(200);

    const afterUpdate = await request(app)
      .get("/api/saved-line-items")
      .set("Authorization", authHeader);

    expect(afterUpdate.body[0].description).toBe("Roof inspection (detailed)");
    expect(afterUpdate.body[0].unit_price).toBe(175);

    const deleted = await request(app)
      .delete(`/api/saved-line-items/${created.body.id}`)
      .set("Authorization", authHeader);

    expect(deleted.status).toBe(200);

    const afterDelete = await request(app)
      .get("/api/saved-line-items")
      .set("Authorization", authHeader);

    expect(afterDelete.body).toHaveLength(0);

  });


  test("a business cannot see another business's saved items in its list", async () => {

    const bizA = await createBusinessAndUser(app, "SLIListIsoA");
    const bizB = await createBusinessAndUser(app, "SLIListIsoB");

    await request(app)
      .post("/api/saved-line-items")
      .set("Authorization", bizA.authHeader)
      .send({ description: "Shingle replacement per sq ft", unit_price: 85 });

    const listB = await request(app)
      .get("/api/saved-line-items")
      .set("Authorization", bizB.authHeader);

    expect(listB.status).toBe(200);
    expect(listB.body).toHaveLength(0);

  });


  test("a business cannot edit or delete another business's saved item (404, not silent success)", async () => {

    const bizA = await createBusinessAndUser(app, "SLIEditIsoA");
    const bizB = await createBusinessAndUser(app, "SLIEditIsoB");

    const created = await request(app)
      .post("/api/saved-line-items")
      .set("Authorization", bizA.authHeader)
      .send({ description: "Gutter cleaning", unit_price: 60 });

    const editAttempt = await request(app)
      .put(`/api/saved-line-items/${created.body.id}`)
      .set("Authorization", bizB.authHeader)
      .send({ description: "Hacked", unit_price: 1 });

    expect(editAttempt.status).toBe(404);

    const deleteAttempt = await request(app)
      .delete(`/api/saved-line-items/${created.body.id}`)
      .set("Authorization", bizB.authHeader);

    expect(deleteAttempt.status).toBe(404);

    const stillThere = await request(app)
      .get("/api/saved-line-items")
      .set("Authorization", bizA.authHeader);

    expect(stillThere.body).toHaveLength(1);
    expect(stillThere.body[0].description).toBe("Gutter cleaning");

  });


  test("empty description is rejected with 400", async () => {

    const { authHeader } = await createBusinessAndUser(app, "SLIEmptyDesc");

    const blank = await request(app)
      .post("/api/saved-line-items")
      .set("Authorization", authHeader)
      .send({ description: "   ", unit_price: 10 });

    expect(blank.status).toBe(400);

    const missing = await request(app)
      .post("/api/saved-line-items")
      .set("Authorization", authHeader)
      .send({ unit_price: 10 });

    expect(missing.status).toBe(400);

  });


  test("negative unit_price is rejected with 400", async () => {

    const { authHeader } = await createBusinessAndUser(app, "SLINegPrice");

    const negative = await request(app)
      .post("/api/saved-line-items")
      .set("Authorization", authHeader)
      .send({ description: "Roof inspection", unit_price: -5 });

    expect(negative.status).toBe(400);

    const notANumber = await request(app)
      .post("/api/saved-line-items")
      .set("Authorization", authHeader)
      .send({ description: "Roof inspection", unit_price: "free" });

    expect(notANumber.status).toBe(400);

  });


  test("invalid input on update is also rejected with 400", async () => {

    const { authHeader } = await createBusinessAndUser(app, "SLIUpdateInvalid");

    const created = await request(app)
      .post("/api/saved-line-items")
      .set("Authorization", authHeader)
      .send({ description: "Roof inspection", unit_price: 150 });

    const badUpdate = await request(app)
      .put(`/api/saved-line-items/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ description: "", unit_price: -1 });

    expect(badUpdate.status).toBe(400);

  });


  test("deleting a saved line item does not affect a quote line item that was quick-added from it earlier", async () => {

    const { authHeader } = await createBusinessAndUser(app, "SLIQuoteIndependence");

    // Create a saved service template.
    const savedItem = await request(app)
      .post("/api/saved-line-items")
      .set("Authorization", authHeader)
      .send({ description: "Roof inspection", unit_price: 150 });

    expect(savedItem.status).toBe(201);

    // Create a customer to quote.
    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Jane Homeowner" });

    const customer_id = customerRes.body.id;

    // "Quick add" is just copying the saved item's description/price into a
    // normal quote_items row via the existing quote-items endpoint - it
    // creates an independent row, not a reference to the saved item.
    const quoteRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id,
        type: "quote",
        items: [{ description: "Roof inspection", quantity: 1, unit_price: 150 }]
      });

    expect(quoteRes.status).toBe(201);

    const quoteBefore = await request(app)
      .get(`/api/quotes/${quoteRes.body.id}`)
      .set("Authorization", authHeader);

    expect(quoteBefore.body.items).toHaveLength(1);
    expect(quoteBefore.body.items[0].description).toBe("Roof inspection");
    expect(quoteBefore.body.items[0].unit_price).toBe(150);

    // Now delete the saved template entirely.
    const deleted = await request(app)
      .delete(`/api/saved-line-items/${savedItem.body.id}`)
      .set("Authorization", authHeader);

    expect(deleted.status).toBe(200);

    // The quote's line item must be completely untouched.
    const quoteAfter = await request(app)
      .get(`/api/quotes/${quoteRes.body.id}`)
      .set("Authorization", authHeader);

    expect(quoteAfter.status).toBe(200);
    expect(quoteAfter.body.items).toHaveLength(1);
    expect(quoteAfter.body.items[0].description).toBe("Roof inspection");
    expect(quoteAfter.body.items[0].unit_price).toBe(150);

  });

});
