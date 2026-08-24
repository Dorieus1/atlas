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

});
