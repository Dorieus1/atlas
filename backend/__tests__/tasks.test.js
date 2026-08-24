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

describe("Tasks", () => {

  test("whitespace-only title is rejected, and a valid task gets trimmed and created", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TaskValidation");
    const customerId = await createCustomer(app, authHeader, "Task Customer");

    const blank = await request(app)
      .post("/api/tasks")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, title: "   " });

    expect(blank.status).toBe(400);

    const created = await request(app)
      .post("/api/tasks")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, title: "  Follow up  " });

    expect(created.status).toBe(200);

    const list = await request(app)
      .get("/api/tasks")
      .set("Authorization", authHeader);

    expect(list.body[0].title).toBe("Follow up");

  });

  test("a task cannot be created against another business's customer", async () => {

    const bizA = await createBusinessAndUser(app, "TaskCrossA");
    const bizB = await createBusinessAndUser(app, "TaskCrossB");

    const customerId = await createCustomer(app, bizA.authHeader, "A's Customer");

    const attempt = await request(app)
      .post("/api/tasks")
      .set("Authorization", bizB.authHeader)
      .send({ customer_id: customerId, title: "Sneaky cross-business task" });

    expect(attempt.status).toBe(404);

  });

  test("completing your own task works, and another business cannot complete it", async () => {

    const bizA = await createBusinessAndUser(app, "TaskCompleteA");
    const bizB = await createBusinessAndUser(app, "TaskCompleteB");

    const customerId = await createCustomer(app, bizA.authHeader, "Complete Customer");

    const created = await request(app)
      .post("/api/tasks")
      .set("Authorization", bizA.authHeader)
      .send({ customer_id: customerId, title: "Call back" });

    const taskId = created.body.id;

    const bAttempt = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set("Authorization", bizB.authHeader);

    expect(bAttempt.status).toBe(404);

    const complete = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set("Authorization", bizA.authHeader);

    expect(complete.status).toBe(200);

    const list = await request(app)
      .get("/api/tasks")
      .set("Authorization", bizA.authHeader);

    expect(list.body[0].status).toBe("completed");

  });

});
