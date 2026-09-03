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

const createAppointment = async (app, authHeader, customer_id) => {

  const res = await request(app)
    .post("/api/appointments")
    .set("Authorization", authHeader)
    .send({ title: "Job", start_time: "2026-09-01T10:00:00.000Z", customer_id: customer_id || null });

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

  // A saved file's extension must come from its validated mimetype, not
  // the uploader's claimed filename - express.static (see server.js's
  // "/uploads" mount) sets the response Content-Type from the file's
  // OWN extension, with no per-file override. If an upload named
  // "evil.html" (a real risk - the multipart filename and Content-Type
  // are both fully attacker-controlled, e.g. via curl or a hand-built
  // FormData) kept that extension just because it also claimed
  // "image/jpeg", it would be saved as "{uuid}.html" and later served
  // back out as real, browser-executed HTML - a stored XSS reachable by
  // anyone who opens that "photo" directly (the owner, a teammate, or a
  // customer in their own portal).
  test("a mismatched filename extension is ignored - the saved file's extension always matches its real, validated mimetype", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PhotoExtensionSpoof");
    const customerId = await createCustomer(app, authHeader, "Extension Spoof Customer");

    const uploaded = await request(app)
      .post("/api/photos")
      .set("Authorization", authHeader)
      .field("customer_id", customerId)
      .attach("photo", Buffer.from("<script>alert(document.cookie)</script>"), {
        filename: "evil.html",
        contentType: "image/jpeg"
      });

    expect(uploaded.status).toBe(201);

    const list = await request(app)
      .get(`/api/photos/customer/${customerId}`)
      .set("Authorization", authHeader);

    expect(list.body[0].url).toMatch(/\.jpg$/);
    expect(list.body[0].url).not.toMatch(/\.html/);

    const savedFilename = list.body[0].url.split("/").pop();
    const onDisk = fs.readdirSync(UPLOAD_DIR);

    expect(onDisk).toContain(savedFilename);
    expect(savedFilename.endsWith(".jpg")).toBe(true);

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

  test("deleting a customer moves them to the trash without touching their photos on disk", async () => {

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

    // Soft delete doesn't cascade - the file on disk is only removed
    // once the customer is permanently purged after 30 days in the
    // trash (see backend/__tests__/customerTrash.test.js).
    expect(fs.existsSync(path.join(UPLOAD_DIR, storedFilename))).toBe(true);

  });


  describe("Photos linked to a specific job", () => {

    test("a photo uploaded with an appointment_id (and no customer_id) is derived from the job's own customer", async () => {

      const { authHeader } = await createBusinessAndUser(app, "PhotoJobDerive");
      const customerId = await createCustomer(app, authHeader, "Job Derive Customer");
      const appointmentId = await createAppointment(app, authHeader, customerId);

      const uploaded = await request(app)
        .post("/api/photos")
        .set("Authorization", authHeader)
        .field("appointment_id", appointmentId)
        .field("photo_type", "before")
        .attach("photo", FAKE_IMAGE, { filename: "before.jpg", contentType: "image/jpeg" });

      expect(uploaded.status).toBe(201);

      const customerList = await request(app)
        .get(`/api/photos/customer/${customerId}`)
        .set("Authorization", authHeader);

      expect(customerList.body).toHaveLength(1);
      expect(customerList.body[0].appointment_id).toBe(appointmentId);
      expect(customerList.body[0].photo_type).toBe("before");

    });

    test("a job's own photos are listed back in the order they were taken", async () => {

      const { authHeader } = await createBusinessAndUser(app, "PhotoJobList");
      const customerId = await createCustomer(app, authHeader, "Job List Customer");
      const appointmentId = await createAppointment(app, authHeader, customerId);

      await request(app)
        .post("/api/photos")
        .set("Authorization", authHeader)
        .field("appointment_id", appointmentId)
        .field("photo_type", "before")
        .attach("photo", FAKE_IMAGE, { filename: "before.jpg", contentType: "image/jpeg" });

      await request(app)
        .post("/api/photos")
        .set("Authorization", authHeader)
        .field("appointment_id", appointmentId)
        .field("photo_type", "after")
        .attach("photo", FAKE_IMAGE, { filename: "after.jpg", contentType: "image/jpeg" });

      const jobPhotos = await request(app)
        .get(`/api/photos/appointment/${appointmentId}`)
        .set("Authorization", authHeader);

      expect(jobPhotos.status).toBe(200);
      expect(jobPhotos.body).toHaveLength(2);
      expect(jobPhotos.body[0].photo_type).toBe("before");
      expect(jobPhotos.body[1].photo_type).toBe("after");

    });

    test("an invalid photo_type is rejected", async () => {

      const { authHeader } = await createBusinessAndUser(app, "PhotoTypeInvalid");
      const customerId = await createCustomer(app, authHeader, "Type Invalid Customer");
      const appointmentId = await createAppointment(app, authHeader, customerId);

      const uploaded = await request(app)
        .post("/api/photos")
        .set("Authorization", authHeader)
        .field("appointment_id", appointmentId)
        .field("photo_type", "sideways")
        .attach("photo", FAKE_IMAGE, { filename: "test.jpg", contentType: "image/jpeg" });

      expect(uploaded.status).toBe(400);

    });

    test("uploading against a job with no customer, and no customer_id given, is rejected clearly", async () => {

      const { authHeader } = await createBusinessAndUser(app, "PhotoJobNoCustomer");
      const appointmentId = await createAppointment(app, authHeader, null);

      const uploaded = await request(app)
        .post("/api/photos")
        .set("Authorization", authHeader)
        .field("appointment_id", appointmentId)
        .attach("photo", FAKE_IMAGE, { filename: "test.jpg", contentType: "image/jpeg" });

      expect(uploaded.status).toBe(400);

    });

    test("uploading against a nonexistent appointment is rejected", async () => {

      const { authHeader } = await createBusinessAndUser(app, "PhotoJobNotFound");

      const uploaded = await request(app)
        .post("/api/photos")
        .set("Authorization", authHeader)
        .field("appointment_id", "does-not-exist")
        .attach("photo", FAKE_IMAGE, { filename: "test.jpg", contentType: "image/jpeg" });

      expect(uploaded.status).toBe(404);

    });

    test("a job's photos are scoped to the right business", async () => {

      const bizA = await createBusinessAndUser(app, "PhotoJobScopeA");
      const bizB = await createBusinessAndUser(app, "PhotoJobScopeB");

      const customerId = await createCustomer(app, bizA.authHeader, "Scope Customer");
      const appointmentId = await createAppointment(app, bizA.authHeader, customerId);

      await request(app)
        .post("/api/photos")
        .set("Authorization", bizA.authHeader)
        .field("appointment_id", appointmentId)
        .attach("photo", FAKE_IMAGE, { filename: "test.jpg", contentType: "image/jpeg" });

      const crossAttempt = await request(app)
        .get(`/api/photos/appointment/${appointmentId}`)
        .set("Authorization", bizB.authHeader);

      expect(crossAttempt.status).toBe(404);

    });

    test("a plain customer-gallery upload with no appointment still works exactly as before, with a null appointment_id", async () => {

      const { authHeader } = await createBusinessAndUser(app, "PhotoNoJob");
      const customerId = await createCustomer(app, authHeader, "No Job Customer");

      await request(app)
        .post("/api/photos")
        .set("Authorization", authHeader)
        .field("customer_id", customerId)
        .attach("photo", FAKE_IMAGE, { filename: "test.jpg", contentType: "image/jpeg" });

      const list = await request(app)
        .get(`/api/photos/customer/${customerId}`)
        .set("Authorization", authHeader);

      expect(list.body[0].appointment_id).toBeNull();
      expect(list.body[0].photo_type).toBeNull();

    });

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
