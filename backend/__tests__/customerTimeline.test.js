const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");

const FAKE_IMAGE = Buffer.from("not-a-real-image-but-thats-fine-for-this-test");


const createCustomer = async (authHeader, name, email) => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name, email });

  return res.body.id;

};


describe("Customer timeline", () => {

  test("a fresh customer's timeline has only their own creation", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TimelineFresh");
    const customerId = await createCustomer(authHeader, "Fresh Customer");

    const res = await request(app)
      .get(`/api/customers/${customerId}/timeline`)
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].type).toBe("customer_created");

  });


  test("merges notes, appointments, quotes, photos, and review requests into one chronologically-sorted feed", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TimelineMerged");

    await request(app)
      .put("/api/business")
      .set("Authorization", authHeader)
      .send({ name: "Whatever", review_link: "https://g.page/r/example/review" });

    const customerId = await createCustomer(authHeader, "Timeline Customer", "timeline@test.com");

    await request(app)
      .post("/api/notes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, note: "Prefers afternoon visits." });

    const appointmentRes = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, title: "Roof inspection", start_time: "2026-09-01T10:00:00.000Z" });

    const quoteRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, type: "invoice", items: [{ description: "Job", quantity: 1, unit_price: 250 }] });

    await request(app)
      .post("/api/photos")
      .set("Authorization", authHeader)
      .field("customer_id", customerId)
      .field("caption", "Before shot")
      .attach("photo", FAKE_IMAGE, { filename: "before.jpg", contentType: "image/jpeg" });

    await request(app)
      .post("/api/review-requests")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId });

    const res = await request(app)
      .get(`/api/customers/${customerId}/timeline`)
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);

    const types = res.body.map((event) => event.type);

    expect(types).toContain("customer_created");
    expect(types).toContain("note");
    expect(types).toContain("appointment");
    expect(types).toContain("quote");
    expect(types).toContain("photo");
    expect(types).toContain("review_request");
    expect(res.body.length).toBe(6);

    // Newest first.
    const dates = res.body.map((event) => new Date(event.date).getTime());
    const sortedDescending = [...dates].sort((a, b) => b - a);
    expect(dates).toEqual(sortedDescending);

    const quoteEvent = res.body.find((event) => event.type === "quote");
    expect(quoteEvent.total).toBe(250);
    expect(quoteEvent.quoteType).toBe("invoice");
    expect(quoteEvent.quoteNumberFormatted).toMatch(/^INV-\d+$/);

    const noteEvent = res.body.find((event) => event.type === "note");
    expect(noteEvent.note).toBe("Prefers afternoon visits.");

    const appointmentEvent = res.body.find((event) => event.type === "appointment");
    expect(appointmentEvent.title).toBe("Roof inspection");
    expect(appointmentEvent.status).toBe("scheduled");

    const photoEvent = res.body.find((event) => event.type === "photo");
    expect(photoEvent.caption).toBe("Before shot");
    // Must match the exact path photoController's own upload response
    // uses (server.js serves /uploads -> the uploads/ dir on disk, and
    // photos are saved under uploads/photos/) - a mismatch here would
    // silently 404 every thumbnail in the timeline.
    expect(photoEvent.photoUrl).toMatch(/^\/uploads\/photos\/.+/);

    const reviewEvent = res.body.find((event) => event.type === "review_request");
    expect(reviewEvent.sentTo).toBe("timeline@test.com");

    void appointmentRes;
    void quoteRes;

  });


  test("an unknown customer 404s", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TimelineNotFound");

    const res = await request(app)
      .get("/api/customers/not-a-real-id/timeline")
      .set("Authorization", authHeader);

    expect(res.status).toBe(404);

  });


  test("a business cannot see another business's customer's timeline", async () => {

    const bizA = await createBusinessAndUser(app, "TimelineIsolationA");
    const bizB = await createBusinessAndUser(app, "TimelineIsolationB");

    const customerId = await createCustomer(bizA.authHeader, "Isolated Customer");

    const res = await request(app)
      .get(`/api/customers/${customerId}/timeline`)
      .set("Authorization", bizB.authHeader);

    expect(res.status).toBe(404);

  });

});
