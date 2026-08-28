const request = require("supertest");
const app = require("../server");
const db = require("../../database/db");
const { createBusinessAndUser } = require("./setup/helpers");


const runAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });
  });

};


const createAppointment = async (authHeader, title = "Roof repair") => {

  const res = await request(app)
    .post("/api/appointments")
    .set("Authorization", authHeader)
    .send({ title, start_time: "2026-09-01T10:00:00.000Z" });

  return res.body.id;

};


describe("Appointment time tracking", () => {

  test("clock in, then clock out, records both timestamps", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ClockInOut");
    const appointmentId = await createAppointment(authHeader);

    const clockIn = await request(app)
      .post(`/api/appointments/${appointmentId}/clock-in`)
      .set("Authorization", authHeader);

    expect(clockIn.status).toBe(200);
    expect(clockIn.body.clock_in_at).toBeTruthy();

    const clockOut = await request(app)
      .post(`/api/appointments/${appointmentId}/clock-out`)
      .set("Authorization", authHeader);

    expect(clockOut.status).toBe(200);
    expect(clockOut.body.clock_in_at).toBeTruthy();
    expect(clockOut.body.clock_out_at).toBeTruthy();

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const appt = list.body.find((a) => a.id === appointmentId);

    expect(appt.clock_in_at).toBeTruthy();
    expect(appt.clock_out_at).toBeTruthy();

  });


  test("clocking in twice in a row without clocking out is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ClockInTwice");
    const appointmentId = await createAppointment(authHeader);

    await request(app)
      .post(`/api/appointments/${appointmentId}/clock-in`)
      .set("Authorization", authHeader);

    const secondClockIn = await request(app)
      .post(`/api/appointments/${appointmentId}/clock-in`)
      .set("Authorization", authHeader);

    expect(secondClockIn.status).toBe(400);
    expect(secondClockIn.body.error.toLowerCase()).toContain("already clocked in");

  });


  test("clocking out without ever clocking in is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ClockOutNoIn");
    const appointmentId = await createAppointment(authHeader);

    const clockOut = await request(app)
      .post(`/api/appointments/${appointmentId}/clock-out`)
      .set("Authorization", authHeader);

    expect(clockOut.status).toBe(400);
    expect(clockOut.body.error.toLowerCase()).toContain("not clocked in");

  });


  test("clocking out twice in a row is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ClockOutTwice");
    const appointmentId = await createAppointment(authHeader);

    await request(app)
      .post(`/api/appointments/${appointmentId}/clock-in`)
      .set("Authorization", authHeader);

    await request(app)
      .post(`/api/appointments/${appointmentId}/clock-out`)
      .set("Authorization", authHeader);

    const secondClockOut = await request(app)
      .post(`/api/appointments/${appointmentId}/clock-out`)
      .set("Authorization", authHeader);

    expect(secondClockOut.status).toBe(400);
    expect(secondClockOut.body.error.toLowerCase()).toContain("already clocked out");

  });


  test("clocking in again after a completed session starts a fresh one", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ClockInAgain");
    const appointmentId = await createAppointment(authHeader);

    await request(app)
      .post(`/api/appointments/${appointmentId}/clock-in`)
      .set("Authorization", authHeader);

    await request(app)
      .post(`/api/appointments/${appointmentId}/clock-out`)
      .set("Authorization", authHeader);

    const secondClockIn = await request(app)
      .post(`/api/appointments/${appointmentId}/clock-in`)
      .set("Authorization", authHeader);

    expect(secondClockIn.status).toBe(200);

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const appt = list.body.find((a) => a.id === appointmentId);

    // A fresh clock-in must clear the previous session's clock_out_at,
    // not leave a stale one sitting alongside the new clock_in_at.
    expect(appt.clock_in_at).toBeTruthy();
    expect(appt.clock_out_at).toBeFalsy();

  });


  test("a nonexistent appointment returns 404 for either action", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ClockNotFound");

    const clockIn = await request(app)
      .post(`/api/appointments/does-not-exist/clock-in`)
      .set("Authorization", authHeader);

    expect(clockIn.status).toBe(404);

    const clockOut = await request(app)
      .post(`/api/appointments/does-not-exist/clock-out`)
      .set("Authorization", authHeader);

    expect(clockOut.status).toBe(404);

  });


  test("a team member can't clock in or out on another business's appointment", async () => {

    const businessA = await createBusinessAndUser(app, "ClockScopeA");
    const businessB = await createBusinessAndUser(app, "ClockScopeB");

    const appointmentId = await createAppointment(businessA.authHeader);

    const crossClockIn = await request(app)
      .post(`/api/appointments/${appointmentId}/clock-in`)
      .set("Authorization", businessB.authHeader);

    expect(crossClockIn.status).toBe(404);

  });


  describe("Analytics labor cost", () => {

    test("labor cost is 0 and hourlyLaborCost is null with no rate set, even with a completed session", async () => {

      const { authHeader } = await createBusinessAndUser(app, "LaborNoRate");
      const appointmentId = await createAppointment(authHeader);

      // Directly seed a 2-hour completed session - going through the real
      // clock-in/clock-out endpoints would take actual wall-clock time to
      // produce a meaningful, non-zero duration.
      await runAsync(
        `UPDATE appointments SET clock_in_at = ?, clock_out_at = ? WHERE id = ?`,
        ["2026-09-01T10:00:00.000Z", "2026-09-01T12:00:00.000Z", appointmentId]
      );

      const res = await request(app)
        .get("/api/analytics")
        .set("Authorization", authHeader);

      expect(res.status).toBe(200);
      expect(res.body.hourlyLaborCost).toBeNull();
      expect(res.body.laborCost).toBe(0);
      expect(res.body.laborHours).toBe(2);

    });


    test("labor cost multiplies logged hours by the business's hourly rate, and reduces the margin", async () => {

      const { authHeader } = await createBusinessAndUser(app, "LaborWithRate");

      await request(app)
        .put("/api/business")
        .set("Authorization", authHeader)
        .send({ name: "LaborWithRate Business", default_hourly_labor_cost: 25 });

      const appointmentId = await createAppointment(authHeader);

      await runAsync(
        `UPDATE appointments SET clock_in_at = ?, clock_out_at = ? WHERE id = ?`,
        ["2026-09-01T10:00:00.000Z", "2026-09-01T13:30:00.000Z", appointmentId]
      );

      const res = await request(app)
        .get("/api/analytics")
        .set("Authorization", authHeader);

      expect(res.status).toBe(200);
      expect(res.body.hourlyLaborCost).toBe(25);
      expect(res.body.laborHours).toBe(3.5);
      expect(res.body.laborCost).toBe(87.5);
      expect(res.body.totalMargin).toBe(-87.5);

    });


    test("an appointment with only a clock-in (still on the clock) isn't counted yet", async () => {

      const { authHeader } = await createBusinessAndUser(app, "LaborStillOn");

      await request(app)
        .put("/api/business")
        .set("Authorization", authHeader)
        .send({ name: "LaborStillOn Business", default_hourly_labor_cost: 40 });

      const appointmentId = await createAppointment(authHeader);

      await request(app)
        .post(`/api/appointments/${appointmentId}/clock-in`)
        .set("Authorization", authHeader);

      const res = await request(app)
        .get("/api/analytics")
        .set("Authorization", authHeader);

      expect(res.body.laborHours).toBe(0);
      expect(res.body.laborCost).toBe(0);

    });


    // Regression test for a real bug a review pass caught: every other
    // money figure on this endpoint is gated on a real status
    // (revenuePaid on 'paid', expensesPaid on a paid invoice), but labor
    // cost had no status filter at all - a job clocked in, worked for a
    // while, then called off (cancelled) was still dragging the margin
    // down for work that was never actually completed for the customer.
    test("labor cost excludes a clocked session on an appointment that was later cancelled", async () => {

      const { authHeader } = await createBusinessAndUser(app, "LaborCancelledExcluded");

      await request(app)
        .put("/api/business")
        .set("Authorization", authHeader)
        .send({ name: "LaborCancelledExcluded Business", default_hourly_labor_cost: 50 });

      const appointmentId = await createAppointment(authHeader);

      await runAsync(
        `UPDATE appointments SET clock_in_at = ?, clock_out_at = ?, status = 'cancelled' WHERE id = ?`,
        ["2026-09-01T10:00:00.000Z", "2026-09-01T12:00:00.000Z", appointmentId]
      );

      const res = await request(app)
        .get("/api/analytics")
        .set("Authorization", authHeader);

      expect(res.body.laborHours).toBe(0);
      expect(res.body.laborCost).toBe(0);

    });

  });


  describe("Business settings validation", () => {

    test("a negative or non-numeric labor cost is rejected", async () => {

      const { authHeader } = await createBusinessAndUser(app, "LaborRateInvalid");

      const negative = await request(app)
        .put("/api/business")
        .set("Authorization", authHeader)
        .send({ name: "LaborRateInvalid Business", default_hourly_labor_cost: -5 });

      expect(negative.status).toBe(400);

      const notANumber = await request(app)
        .put("/api/business")
        .set("Authorization", authHeader)
        .send({ name: "LaborRateInvalid Business", default_hourly_labor_cost: "free" });

      expect(notANumber.status).toBe(400);

    });


    test("an empty labor cost clears it back to unset", async () => {

      const { authHeader } = await createBusinessAndUser(app, "LaborRateClear");

      await request(app)
        .put("/api/business")
        .set("Authorization", authHeader)
        .send({ name: "LaborRateClear Business", default_hourly_labor_cost: 30 });

      await request(app)
        .put("/api/business")
        .set("Authorization", authHeader)
        .send({ name: "LaborRateClear Business", default_hourly_labor_cost: "" });

      const res = await request(app)
        .get("/api/business")
        .set("Authorization", authHeader);

      expect(res.body[0].default_hourly_labor_cost).toBeNull();

    });

  });

});
