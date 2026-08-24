const request = require("supertest");
const fs = require("fs");
const path = require("path");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");
const { UPLOAD_DIR } = require("../services/photoService");

const createCustomer = async (app, authHeader, name) => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name });

  return res.body.id;

};

const FAKE_IMAGE = Buffer.from("not-a-real-image-but-thats-fine-for-this-test");

describe("Photos", () => {

  test("a valid image upload is accepted, linked to the customer, and listed back", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PhotoUpload");
    const customerId = await createCustomer(app, authHeader, "Photo Customer");

    const uploaded = await request(app)
      .post("/api/photos")
      .set("Authorization", authHeader)
      .field("customer_id", customerId)
      .field("caption", "Roof damage, north side")
      .attach("photo", FAKE_IMAGE, { filename: "damage.jpg", contentType: "image/jpeg" });

    expect(uploaded.status).toBe(201);

    const list = await request(app)
      .get(`/api/photos/customer/${customerId}`)
      .set("Authorization", authHeader);

    expect(list.status).toBe(200);
    expect(list.body.length).toBe(1);
    expect(list.body[0].caption).toBe("Roof damage, north side");
    expect(list.body[0].url).toMatch(/^\/uploads\/photos\/.+/);

  });

  test("a non-image file is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PhotoRejectType");
    const customerId = await createCustomer(app, authHeader, "Reject Customer");

    const uploaded = await request(app)
      .post("/api/photos")
      .set("Authorization", authHeader)
      .field("customer_id", customerId)
      .attach("photo", Buffer.from("just some text"), { filename: "notes.txt", contentType: "text/plain" });

    expect(uploaded.status).toBe(400);

  });

  test("an upload with no customer_id is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PhotoNoCustomer");

    const uploaded = await request(app)
      .post("/api/photos")
      .set("Authorization", authHeader)
      .attach("photo", FAKE_IMAGE, { filename: "test.png", contentType: "image/png" });

    expect(uploaded.status).toBe(400);

  });

  test("a photo cannot be uploaded against another business's customer", async () => {

    const bizA = await createBusinessAndUser(app, "PhotoCrossA");
    const bizB = await createBusinessAndUser(app, "PhotoCrossB");

    const customerId = await createCustomer(app, bizA.authHeader, "A's Customer");

    const attempt = await request(app)
      .post("/api/photos")
      .set("Authorization", bizB.authHeader)
      .field("customer_id", customerId)
      .attach("photo", FAKE_IMAGE, { filename: "test.png", contentType: "image/png" });

    expect(attempt.status).toBe(404);

  });

  test("a customer's photos are scoped to the right business when listing", async () => {

    const bizA = await createBusinessAndUser(app, "PhotoListA");
    const bizB = await createBusinessAndUser(app, "PhotoListB");

    const customerId = await createCustomer(app, bizA.authHeader, "List Customer");

    await request(app)
      .post("/api/photos")
      .set("Authorization", bizA.authHeader)
      .field("customer_id", customerId)
      .attach("photo", FAKE_IMAGE, { filename: "test.png", contentType: "image/png" });

    const crossList = await request(app)
      .get(`/api/photos/customer/${customerId}`)
      .set("Authorization", bizB.authHeader);

    expect(crossList.status).toBe(404);

  });

  test("deleting a photo removes it from the list and from disk, and is rejected for another business", async () => {

    const bizA = await createBusinessAndUser(app, "PhotoDeleteA");
    const bizB = await createBusinessAndUser(app, "PhotoDeleteB");

    const customerId = await createCustomer(app, bizA.authHeader, "Delete Customer");

    const uploaded = await request(app)
      .post("/api/photos")
      .set("Authorization", bizA.authHeader)
      .field("customer_id", customerId)
      .attach("photo", FAKE_IMAGE, { filename: "test.png", contentType: "image/png" });

    const list = await request(app)
      .get(`/api/photos/customer/${customerId}`)
      .set("Authorization", bizA.authHeader);

    const photoId = list.body[0].id;
    const storedFilename = path.basename(list.body[0].url);

    expect(fs.existsSync(path.join(UPLOAD_DIR, storedFilename))).toBe(true);

    const bAttempt = await request(app)
      .delete(`/api/photos/${photoId}`)
      .set("Authorization", bizB.authHeader);

    expect(bAttempt.status).toBe(404);

    const ownDelete = await request(app)
      .delete(`/api/photos/${photoId}`)
      .set("Authorization", bizA.authHeader);

    expect(ownDelete.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fs.existsSync(path.join(UPLOAD_DIR, storedFilename))).toBe(false);

  });

  test("deleting a customer also removes their photos from disk", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PhotoCustomerCascade");
    const customerId = await createCustomer(app, authHeader, "Cascade Customer");

    const uploaded = await request(app)
      .post("/api/photos")
      .set("Authorization", authHeader)
      .field("customer_id", customerId)
      .attach("photo", FAKE_IMAGE, { filename: "test.png", contentType: "image/png" });

    const list = await request(app)
      .get(`/api/photos/customer/${customerId}`)
      .set("Authorization", authHeader);

    const storedFilename = path.basename(list.body[0].url);

    await request(app)
      .delete(`/api/customers/${customerId}`)
      .set("Authorization", authHeader);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fs.existsSync(path.join(UPLOAD_DIR, storedFilename))).toBe(false);

  });


  describe("AI draft estimate from a photo", () => {

    beforeEach(() => {
      global.__mockOpenAICreate.mockClear();
    });

    test("drafts line items from a valid AI response", async () => {

      const { authHeader } = await createBusinessAndUser(app, "PhotoEstimateValid");
      const customerId = await createCustomer(app, authHeader, "Estimate Customer");

      const uploaded = await request(app)
        .post("/api/photos")
        .set("Authorization", authHeader)
        .field("customer_id", customerId)
        .field("caption", "Cracked shingles")
        .attach("photo", FAKE_IMAGE, { filename: "damage.jpg", contentType: "image/jpeg" });

      global.__mockOpenAICreate.mockResolvedValueOnce({

        output_text: JSON.stringify({
          items: [
            { description: "Replace damaged shingles", quantity: 12, unit_price: 8.5 },
            { description: "Labor", quantity: 2, unit_price: 75 }
          ],
          summary: "Visible shingle damage on the north-facing slope."
        })

      });

      const res = await request(app)
        .post(`/api/photos/${uploaded.body.id}/draft-estimate`)
        .set("Authorization", authHeader);

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(2);
      expect(res.body.items[0].description).toBe("Replace damaged shingles");
      expect(res.body.summary).toContain("shingle");

      // Confirms the actual image bytes were sent to the model, not just
      // a filename or URL - the model has no access to this server's disk.
      const callArgs = global.__mockOpenAICreate.mock.calls[0][0];
      const imageContent = callArgs.input[0].content.find((c) => c.type === "input_image");
      expect(imageContent.image_url).toMatch(/^data:image\/jpeg;base64,/);

    });

    test("strips a markdown code fence if the model wraps its JSON in one", async () => {

      const { authHeader } = await createBusinessAndUser(app, "PhotoEstimateFenced");
      const customerId = await createCustomer(app, authHeader, "Fenced Customer");

      const uploaded = await request(app)
        .post("/api/photos")
        .set("Authorization", authHeader)
        .field("customer_id", customerId)
        .attach("photo", FAKE_IMAGE, { filename: "damage.jpg", contentType: "image/jpeg" });

      global.__mockOpenAICreate.mockResolvedValueOnce({

        output_text: "```json\n" + JSON.stringify({
          items: [{ description: "Patch drywall", quantity: 1, unit_price: 150 }],
          summary: "Water damage on the ceiling."
        }) + "\n```"

      });

      const res = await request(app)
        .post(`/api/photos/${uploaded.body.id}/draft-estimate`)
        .set("Authorization", authHeader);

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(1);

    });

    test("a malformed AI response is reported as a 502, not a crash", async () => {

      const { authHeader } = await createBusinessAndUser(app, "PhotoEstimateMalformed");
      const customerId = await createCustomer(app, authHeader, "Malformed Customer");

      const uploaded = await request(app)
        .post("/api/photos")
        .set("Authorization", authHeader)
        .field("customer_id", customerId)
        .attach("photo", FAKE_IMAGE, { filename: "damage.jpg", contentType: "image/jpeg" });

      global.__mockOpenAICreate.mockResolvedValueOnce({
        output_text: "Sorry, I can't help with that."
      });

      const res = await request(app)
        .post(`/api/photos/${uploaded.body.id}/draft-estimate`)
        .set("Authorization", authHeader);

      expect(res.status).toBe(502);

    });

    test("can't draft an estimate for another business's photo", async () => {

      const bizA = await createBusinessAndUser(app, "PhotoEstimateCrossA");
      const bizB = await createBusinessAndUser(app, "PhotoEstimateCrossB");
      const customerId = await createCustomer(app, bizA.authHeader, "A's Customer");

      const uploaded = await request(app)
        .post("/api/photos")
        .set("Authorization", bizA.authHeader)
        .field("customer_id", customerId)
        .attach("photo", FAKE_IMAGE, { filename: "damage.jpg", contentType: "image/jpeg" });

      const res = await request(app)
        .post(`/api/photos/${uploaded.body.id}/draft-estimate`)
        .set("Authorization", bizB.authHeader);

      expect(res.status).toBe(404);
      expect(global.__mockOpenAICreate).not.toHaveBeenCalled();

    });

  });

});
