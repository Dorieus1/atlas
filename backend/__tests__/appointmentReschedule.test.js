const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");


const createCustomer = async (authHeader, name) => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name });

  return res.body.id;

};


describe("Drag-to-reschedule an appointment", () => {

  test("moving an appointment to a new start_time preserves its original duration", async () => {

    const { authHeader } = await createBusinessAndUser(app, "RescheduleDuration");
    const customerId = await createCustomer(authHeader, "Reschedule Customer");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        title: "Roof inspection",
        start_time: "2026-09-01T10:00:00.000Z",
        end_time: "2026-09-01T11:30:00.000Z"
      });

    const rescheduled = await request(app)
      .patch(`/api/appointments/${created.body.id}/reschedule`)
      .set("Authorization", authHeader)
      .send({ start_time: "2026-09-05T14:00:00.000Z" });

    expect(rescheduled.status).toBe(200);

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const appt = list.body.find((a) => a.id === created.body.id);

    // Original duration was 1.5 hours - must be preserved on the new day.
    expect(appt.start_time).toBe("2026-09-05T14:00:00.000Z");
    expect(appt.end_time).toBe("2026-09-05T15:30:00.000Z");

  });


  test("an appointment with no explicit end_time still has none after being rescheduled", async () => {

    const { authHeader } = await createBusinessAndUser(app, "RescheduleNoEndTime");
    const customerId = await createCustomer(authHeader, "No End Time Customer");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        title: "Quick estimate",
        start_time: "2026-09-01T10:00:00.000Z"
      });

    const rescheduled = await request(app)
      .patch(`/api/appointments/${created.body.id}/reschedule`)
      .set("Authorization", authHeader)
      .send({ start_time: "2026-09-05T14:00:00.000Z" });

    expect(rescheduled.status).toBe(200);

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const appt = list.body.find((a) => a.id === created.body.id);

    expect(appt.start_time).toBe("2026-09-05T14:00:00.000Z");
    expect(appt.end_time).toBeNull();

  });


  test("a missing or invalid start_time is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "RescheduleInvalid");
    const customerId = await createCustomer(authHeader, "Invalid Reschedule Customer");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, title: "Job", start_time: "2026-09-01T10:00:00.000Z" });

    const missing = await request(app)
      .patch(`/api/appointments/${created.body.id}/reschedule`)
      .set("Authorization", authHeader)
      .send({});

    expect(missing.status).toBe(400);

    const invalid = await request(app)
      .patch(`/api/appointments/${created.body.id}/reschedule`)
      .set("Authorization", authHeader)
      .send({ start_time: "not a real date" });

    expect(invalid.status).toBe(400);

  });


  test("rescheduling an unknown appointment 404s", async () => {

    const { authHeader } = await createBusinessAndUser(app, "RescheduleNotFound");

    const res = await request(app)
      .patch("/api/appointments/not-a-real-id/reschedule")
      .set("Authorization", authHeader)
      .send({ start_time: "2026-09-05T14:00:00.000Z" });

    expect(res.status).toBe(404);

  });


  test("rescheduling never affects a different recurring occurrence in the same series", async () => {

    const { authHeader } = await createBusinessAndUser(app, "RescheduleSeries");
    const customerId = await createCustomer(authHeader, "Series Reschedule Customer");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        title: "Weekly maintenance",
        start_time: "2026-09-01T09:00:00.000Z",
        recurrence: "weekly",
        occurrences: 3
      });

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const [first, second, third] = list.body
      .filter((a) => a.recurrence_id === created.body.recurrence_id)
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    await request(app)
      .patch(`/api/appointments/${first.id}/reschedule`)
      .set("Authorization", authHeader)
      .send({ start_time: "2026-09-03T09:00:00.000Z" });

    const after = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const afterById = Object.fromEntries(after.body.map((a) => [a.id, a]));

    expect(afterById[first.id].start_time).toBe("2026-09-03T09:00:00.000Z");
    expect(afterById[second.id].start_time).toBe(second.start_time);
    expect(afterById[third.id].start_time).toBe(third.start_time);

  });


  test("rescheduling is scoped to the right business", async () => {

    const bizA = await createBusinessAndUser(app, "RescheduleIsolationA");
    const bizB = await createBusinessAndUser(app, "RescheduleIsolationB");

    const customerA = await createCustomer(bizA.authHeader, "Isolation Customer A");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", bizA.authHeader)
      .send({ customer_id: customerA, title: "A's job", start_time: "2026-09-01T10:00:00.000Z" });

    const crossAttempt = await request(app)
      .patch(`/api/appointments/${created.body.id}/reschedule`)
      .set("Authorization", bizB.authHeader)
      .send({ start_time: "2026-09-05T10:00:00.000Z" });

    expect(crossAttempt.status).toBe(404);

  });

});
