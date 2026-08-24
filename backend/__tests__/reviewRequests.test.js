const request = require("supertest");
const app = require("../server");
const db = require("../../database/db");
const { createBusinessAndUser } = require("./setup/helpers");

const createCustomer = async (app, authHeader, fields) => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send(fields);

  return res.body.id;

};

const setReviewLink = async (app, authHeader, review_link) => {

  await request(app)
    .put("/api/business")
    .set("Authorization", authHeader)
    .send({ name: "Whatever Business", review_link });

};

describe("Review Requests", () => {

  test("sending a review request requires a customer_id", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ReviewNoCustomer");

    const res = await request(app)
      .post("/api/review-requests")
      .set("Authorization", authHeader)
      .send({});

    expect(res.status).toBe(400);

  });

  test("a customer with no email on file can't receive a review request", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ReviewNoEmail");
    const customerId = await createCustomer(app, authHeader, { name: "No Email Customer" });

    await setReviewLink(app, authHeader, "https://g.page/r/example/review");

    const res = await request(app)
      .post("/api/review-requests")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId });

    expect(res.status).toBe(400);

  });

  test("a business with no review link set can't send review requests yet", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ReviewNoLink");
    const customerId = await createCustomer(app, authHeader, { name: "Has Email", email: "customer@test.com" });

    const res = await request(app)
      .post("/api/review-requests")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId });

    expect(res.status).toBe(400);

  });

  test("a valid review request is sent, recorded, and shows up when listing that customer's requests", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ReviewValid");
    const customerId = await createCustomer(app, authHeader, { name: "Happy Customer", email: "happy@test.com" });

    await setReviewLink(app, authHeader, "https://g.page/r/example/review");

    const sent = await request(app)
      .post("/api/review-requests")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId });

    expect(sent.status).toBe(201);

    const list = await request(app)
      .get(`/api/review-requests/customer/${customerId}`)
      .set("Authorization", authHeader);

    expect(list.status).toBe(200);
    expect(list.body.length).toBe(1);
    expect(list.body[0].sent_to).toBe("happy@test.com");

  });

  test("a review request cannot be sent for another business's customer", async () => {

    const bizA = await createBusinessAndUser(app, "ReviewCrossA");
    const bizB = await createBusinessAndUser(app, "ReviewCrossB");

    const customerId = await createCustomer(app, bizA.authHeader, { name: "A's Customer", email: "a@test.com" });

    await setReviewLink(app, bizB.authHeader, "https://g.page/r/example/review");

    const attempt = await request(app)
      .post("/api/review-requests")
      .set("Authorization", bizB.authHeader)
      .send({ customer_id: customerId });

    expect(attempt.status).toBe(404);

  });

  test("a customer's review request history is scoped to the right business when listing", async () => {

    const bizA = await createBusinessAndUser(app, "ReviewListA");
    const bizB = await createBusinessAndUser(app, "ReviewListB");

    const customerId = await createCustomer(app, bizA.authHeader, { name: "List Customer", email: "list@test.com" });

    const crossList = await request(app)
      .get(`/api/review-requests/customer/${customerId}`)
      .set("Authorization", bizB.authHeader);

    expect(crossList.status).toBe(404);

  });

  test("deleting a customer also removes their review request history", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ReviewCascade");
    const customerId = await createCustomer(app, authHeader, { name: "Cascade Customer", email: "cascade@test.com" });

    await setReviewLink(app, authHeader, "https://g.page/r/example/review");

    await request(app)
      .post("/api/review-requests")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId });

    await request(app)
      .delete(`/api/customers/${customerId}`)
      .set("Authorization", authHeader);

    const remaining = await new Promise((resolve, reject) => {
      db.all(
        "SELECT id FROM review_requests WHERE customer_id = ?",
        [customerId],
        (err, rows) => (err ? reject(err) : resolve(rows))
      );
    });

    expect(remaining.length).toBe(0);

  });

});
