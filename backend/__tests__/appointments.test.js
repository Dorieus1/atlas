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

describe("Appointments", () => {

  test("missing title or start_time is rejected, and a valid appointment gets trimmed and created", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ApptValidation");
    const customerId = await createCustomer(app, authHeader, "Appt Customer");

    const missingStart = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, title: "Roof inspection" });

    expect(missingStart.status).toBe(400);

    const blankTitle = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, title: "   ", start_time: "2026-09-01T10:00:00.000Z" });

    expect(blankTitle.status).toBe(400);

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        title: "  Roof inspection  ",
        start_time: "2026-09-01T10:00:00.000Z"
      });

    expect(created.status).toBe(201);

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    expect(list.body[0].title).toBe("Roof inspection");
    expect(list.body[0].status).toBe("scheduled");

  });

  test("an invalid date, or an end_time before start_time, is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ApptDateValidation");

    const badDate = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ title: "Bad date", start_time: "not-a-date" });

    expect(badDate.status).toBe(400);

    const backwards = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Backwards",
        start_time: "2026-09-01T12:00:00.000Z",
        end_time: "2026-09-01T10:00:00.000Z"
      });

    expect(backwards.status).toBe(400);

  });

  test("an appointment cannot be created against another business's customer", async () => {

    const bizA = await createBusinessAndUser(app, "ApptCrossA");
    const bizB = await createBusinessAndUser(app, "ApptCrossB");

    const customerId = await createCustomer(app, bizA.authHeader, "A's Customer");

    const attempt = await request(app)
      .post("/api/appointments")
      .set("Authorization", bizB.authHeader)
      .send({
        customer_id: customerId,
        title: "Sneaky cross-business appointment",
        start_time: "2026-09-01T10:00:00.000Z"
      });

    expect(attempt.status).toBe(404);

  });

  test("appointments can be scheduled without a linked customer", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ApptNoCustomer");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ title: "Blocked time", start_time: "2026-09-01T10:00:00.000Z" });

    expect(created.status).toBe(201);

  });

  test("a customer's appointments can be listed by customer_id, scoped to the right business", async () => {

    const bizA = await createBusinessAndUser(app, "ApptListA");
    const bizB = await createBusinessAndUser(app, "ApptListB");

    const customerId = await createCustomer(app, bizA.authHeader, "List Customer");

    await request(app)
      .post("/api/appointments")
      .set("Authorization", bizA.authHeader)
      .send({ customer_id: customerId, title: "Estimate visit", start_time: "2026-09-01T10:00:00.000Z" });

    const ownList = await request(app)
      .get(`/api/appointments/customer/${customerId}`)
      .set("Authorization", bizA.authHeader);

    expect(ownList.status).toBe(200);
    expect(ownList.body.length).toBe(1);

    const crossList = await request(app)
      .get(`/api/appointments/customer/${customerId}`)
      .set("Authorization", bizB.authHeader);

    expect(crossList.status).toBe(404);

  });

  test("updating status works for the owning business, is rejected for another, and rejects an invalid status", async () => {

    const bizA = await createBusinessAndUser(app, "ApptStatusA");
    const bizB = await createBusinessAndUser(app, "ApptStatusB");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", bizA.authHeader)
      .send({ title: "Job", start_time: "2026-09-01T10:00:00.000Z" });

    const apptId = created.body.id;

    const badStatus = await request(app)
      .patch(`/api/appointments/${apptId}`)
      .set("Authorization", bizA.authHeader)
      .send({ status: "not-a-real-status" });

    expect(badStatus.status).toBe(400);

    const bAttempt = await request(app)
      .patch(`/api/appointments/${apptId}`)
      .set("Authorization", bizB.authHeader)
      .send({ status: "completed" });

    expect(bAttempt.status).toBe(404);

    const complete = await request(app)
      .patch(`/api/appointments/${apptId}`)
      .set("Authorization", bizA.authHeader)
      .send({ status: "completed" });

    expect(complete.status).toBe(200);

  });

  test("deleting an appointment works for the owning business, and is rejected for another", async () => {

    const bizA = await createBusinessAndUser(app, "ApptDeleteA");
    const bizB = await createBusinessAndUser(app, "ApptDeleteB");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", bizA.authHeader)
      .send({ title: "To delete", start_time: "2026-09-01T10:00:00.000Z" });

    const apptId = created.body.id;

    const bAttempt = await request(app)
      .delete(`/api/appointments/${apptId}`)
      .set("Authorization", bizB.authHeader);

    expect(bAttempt.status).toBe(404);

    const ownDelete = await request(app)
      .delete(`/api/appointments/${apptId}`)
      .set("Authorization", bizA.authHeader);

    expect(ownDelete.status).toBe(200);

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", bizA.authHeader);

    expect(list.body.length).toBe(0);

  });


  test("two overlapping appointments are both flagged, a non-overlapping one is not", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ApptConflict");

    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ title: "First job", start_time: "2026-09-01T10:00:00.000Z", end_time: "2026-09-01T11:00:00.000Z" });

    // Starts before the first ends - a real overlap.
    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ title: "Overlapping job", start_time: "2026-09-01T10:30:00.000Z", end_time: "2026-09-01T11:30:00.000Z" });

    // Well clear of both.
    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ title: "Clear job", start_time: "2026-09-01T14:00:00.000Z", end_time: "2026-09-01T15:00:00.000Z" });

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const byTitle = Object.fromEntries(list.body.map((a) => [a.title, a.has_conflict]));

    expect(byTitle["First job"]).toBe(true);
    expect(byTitle["Overlapping job"]).toBe(true);
    expect(byTitle["Clear job"]).toBe(false);

  });


  test("an appointment with no end_time is treated as 1 hour long, and flags a job starting inside that window", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ApptConflictDefaultOverlap");

    // No end_time - defaults to a 1-hour block, so 10:00-11:00.
    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ title: "Undated job", start_time: "2026-09-01T10:00:00.000Z" });

    // Starts at 10:45, inside that assumed 10:00-11:00 window.
    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ title: "Just inside", start_time: "2026-09-01T10:45:00.000Z" });

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const byTitle = Object.fromEntries(list.body.map((a) => [a.title, a.has_conflict]));

    expect(byTitle["Undated job"]).toBe(true);
    expect(byTitle["Just inside"]).toBe(true);

  });


  test("a job starting exactly when an undated appointment's assumed hour ends is not a conflict", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ApptConflictBackToBack");

    // No end_time - defaults to a 1-hour block, so 10:00-11:00.
    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ title: "Undated job", start_time: "2026-09-01T10:00:00.000Z" });

    // Starts right at 11:00 - back-to-back, not overlapping.
    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ title: "Back to back", start_time: "2026-09-01T11:00:00.000Z" });

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const byTitle = Object.fromEntries(list.body.map((a) => [a.title, a.has_conflict]));

    expect(byTitle["Undated job"]).toBe(false);
    expect(byTitle["Back to back"]).toBe(false);

  });


  test("a cancelled appointment never counts as a conflict", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ApptConflictCancelled");

    const first = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ title: "Original", start_time: "2026-09-01T10:00:00.000Z", end_time: "2026-09-01T11:00:00.000Z" });

    await request(app)
      .patch(`/api/appointments/${first.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "cancelled" });

    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ title: "Same slot, rebooked", start_time: "2026-09-01T10:00:00.000Z", end_time: "2026-09-01T11:00:00.000Z" });

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const byTitle = Object.fromEntries(list.body.map((a) => [a.title, a.has_conflict]));

    expect(byTitle["Original"]).toBe(false);
    expect(byTitle["Same slot, rebooked"]).toBe(false);

  });


  test("conflict detection is scoped to the right business", async () => {

    const bizA = await createBusinessAndUser(app, "ApptConflictScopeA");
    const bizB = await createBusinessAndUser(app, "ApptConflictScopeB");

    await request(app)
      .post("/api/appointments")
      .set("Authorization", bizA.authHeader)
      .send({ title: "A's job", start_time: "2026-09-01T10:00:00.000Z", end_time: "2026-09-01T11:00:00.000Z" });

    await request(app)
      .post("/api/appointments")
      .set("Authorization", bizB.authHeader)
      .send({ title: "B's job, same time", start_time: "2026-09-01T10:00:00.000Z", end_time: "2026-09-01T11:00:00.000Z" });

    const listA = await request(app)
      .get("/api/appointments")
      .set("Authorization", bizA.authHeader);

    expect(listA.body[0].has_conflict).toBe(false);

  });

});
