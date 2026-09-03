const request = require("supertest");
const { v4: uuidv4 } = require("uuid");
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


const createAppointment = async (authHeader, title = "Job", start_time = "2026-01-15T10:00:00.000Z") => {

  const res = await request(app)
    .post("/api/appointments")
    .set("Authorization", authHeader)
    .send({ title, start_time });

  return res.body.id;

};


const inviteTeammate = async (authHeader, prefix) => {

  const res = await request(app)
    .post("/api/auth/teammates")
    .set("Authorization", authHeader)
    .send({
      name: `${prefix} Teammate`,
      email: `${prefix.toLowerCase()}@test.com`,
      password: "testpass123",
      role: "staff"
    });

  return res.body.id;

};


const seedTimeEntry = (business_id, appointment_id, user_id, clock_in_at, clock_out_at) =>

  runAsync(

    `INSERT INTO time_entries (id, business_id, appointment_id, user_id, clock_in_at, clock_out_at) VALUES (?, ?, ?, ?, ?, ?)`,

    [uuidv4(), business_id, appointment_id, user_id, clock_in_at, clock_out_at]

  );


describe("Timesheets (payroll report)", () => {

  test("summarizes one person's logged hours and sessions for a date range", async () => {

    const { authHeader, userId, business_id } = await createBusinessAndUser(app, "TimesheetSolo");
    const appointmentId = await createAppointment(authHeader);

    await seedTimeEntry(business_id, appointmentId, userId, "2026-01-15T10:00:00.000Z", "2026-01-15T12:30:00.000Z");

    const res = await request(app)
      .get("/api/timesheets?start=2026-01-01&end=2026-01-31")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body.people).toHaveLength(1);
    expect(res.body.people[0].user_id).toBe(userId);
    expect(res.body.people[0].hours).toBe(2.5);
    expect(res.body.people[0].session_count).toBe(1);
    expect(res.body.people[0].has_open_session).toBe(false);
    expect(res.body.total_hours).toBe(2.5);

  });


  test("multiplies total hours by the business's hourly rate for total pay, per person and overall", async () => {

    const { authHeader, userId, business_id } = await createBusinessAndUser(app, "TimesheetPay");

    await request(app)
      .put("/api/business")
      .set("Authorization", authHeader)
      .send({ name: "TimesheetPay Business", default_hourly_labor_cost: 22 });

    const appointmentId = await createAppointment(authHeader);

    await seedTimeEntry(business_id, appointmentId, userId, "2026-01-15T10:00:00.000Z", "2026-01-15T14:00:00.000Z");

    const res = await request(app)
      .get("/api/timesheets?start=2026-01-01&end=2026-01-31")
      .set("Authorization", authHeader);

    expect(res.body.hourly_rate).toBe(22);
    expect(res.body.total_hours).toBe(4);
    expect(res.body.total_pay).toBe(88);

  });


  test("with no hourly rate set, pay is null but hours are still reported", async () => {

    const { authHeader, userId, business_id } = await createBusinessAndUser(app, "TimesheetNoRate");
    const appointmentId = await createAppointment(authHeader);

    await seedTimeEntry(business_id, appointmentId, userId, "2026-01-15T10:00:00.000Z", "2026-01-15T11:00:00.000Z");

    const res = await request(app)
      .get("/api/timesheets?start=2026-01-01&end=2026-01-31")
      .set("Authorization", authHeader);

    expect(res.body.hourly_rate).toBeNull();
    expect(res.body.total_pay).toBeNull();
    expect(res.body.people[0].hours).toBe(1);

  });


  test("breaks hours down separately per team member, not lumped together", async () => {

    const { authHeader, userId, business_id } = await createBusinessAndUser(app, "TimesheetCrew");
    const teammateId = await inviteTeammate(authHeader, "TimesheetCrewMate");
    const appointmentId = await createAppointment(authHeader);

    await seedTimeEntry(business_id, appointmentId, userId, "2026-01-15T10:00:00.000Z", "2026-01-15T12:00:00.000Z");
    await seedTimeEntry(business_id, appointmentId, teammateId, "2026-01-15T10:00:00.000Z", "2026-01-15T13:00:00.000Z");

    const res = await request(app)
      .get("/api/timesheets?start=2026-01-01&end=2026-01-31")
      .set("Authorization", authHeader);

    expect(res.body.people).toHaveLength(2);

    const ownerRow = res.body.people.find((p) => p.user_id === userId);
    const mateRow = res.body.people.find((p) => p.user_id === teammateId);

    expect(ownerRow.hours).toBe(2);
    expect(mateRow.hours).toBe(3);
    expect(res.body.total_hours).toBe(5);

  });


  test("a session outside the requested date range isn't counted", async () => {

    const { authHeader, userId, business_id } = await createBusinessAndUser(app, "TimesheetOutOfRange");
    const appointmentId = await createAppointment(authHeader, "Job", "2026-02-15T10:00:00.000Z");

    await seedTimeEntry(business_id, appointmentId, userId, "2026-02-15T10:00:00.000Z", "2026-02-15T12:00:00.000Z");

    const res = await request(app)
      .get("/api/timesheets?start=2026-01-01&end=2026-01-31")
      .set("Authorization", authHeader);

    expect(res.body.people).toHaveLength(0);
    expect(res.body.total_hours).toBe(0);

  });


  test("a still-open session is flagged but doesn't count toward hours yet", async () => {

    const { authHeader, userId, business_id } = await createBusinessAndUser(app, "TimesheetOpenSession");
    const appointmentId = await createAppointment(authHeader);

    // Closed session earlier that day, plus a currently-open one -
    // hours should reflect only the closed one.
    await seedTimeEntry(business_id, appointmentId, userId, "2026-01-15T08:00:00.000Z", "2026-01-15T09:00:00.000Z");
    await seedTimeEntry(business_id, appointmentId, userId, "2026-01-15T13:00:00.000Z", null);

    const res = await request(app)
      .get("/api/timesheets?start=2026-01-01&end=2026-01-31")
      .set("Authorization", authHeader);

    expect(res.body.people[0].hours).toBe(1);
    expect(res.body.people[0].session_count).toBe(1);
    expect(res.body.people[0].has_open_session).toBe(true);

  });


  test("excludes a session logged on an appointment that was later cancelled", async () => {

    const { authHeader, userId, business_id } = await createBusinessAndUser(app, "TimesheetCancelled");
    const appointmentId = await createAppointment(authHeader);

    await seedTimeEntry(business_id, appointmentId, userId, "2026-01-15T10:00:00.000Z", "2026-01-15T12:00:00.000Z");
    await runAsync(`UPDATE appointments SET status = 'cancelled' WHERE id = ?`, [appointmentId]);

    const res = await request(app)
      .get("/api/timesheets?start=2026-01-01&end=2026-01-31")
      .set("Authorization", authHeader);

    expect(res.body.people).toHaveLength(0);

  });


  test("a staff member (not the owner) can't view the timesheet report", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TimesheetStaffBlocked");
    const teammateId = await inviteTeammate(authHeader, "TimesheetStaffBlockedMate");

    const mateLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "timesheetstaffblockedmate@test.com", password: "testpass123" });

    const res = await request(app)
      .get("/api/timesheets?start=2026-01-01&end=2026-01-31")
      .set("Authorization", `Bearer ${mateLogin.body.token}`);

    expect(res.status).toBe(403);

  });


  test("missing or invalid dates are rejected with a clear error", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TimesheetBadDates");

    const missing = await request(app)
      .get("/api/timesheets")
      .set("Authorization", authHeader);

    expect(missing.status).toBe(400);

    const invalid = await request(app)
      .get("/api/timesheets?start=not-a-date&end=2026-01-31")
      .set("Authorization", authHeader);

    expect(invalid.status).toBe(400);

    const backwards = await request(app)
      .get("/api/timesheets?start=2026-01-31&end=2026-01-01")
      .set("Authorization", authHeader);

    expect(backwards.status).toBe(400);

    const tooWide = await request(app)
      .get("/api/timesheets?start=2020-01-01&end=2026-01-01")
      .set("Authorization", authHeader);

    expect(tooWide.status).toBe(400);

  });


  test("exports the same numbers as a downloadable CSV", async () => {

    const { authHeader, userId, business_id } = await createBusinessAndUser(app, "TimesheetCsv");

    await request(app)
      .put("/api/business")
      .set("Authorization", authHeader)
      .send({ name: "TimesheetCsv Business", default_hourly_labor_cost: 15 });

    const appointmentId = await createAppointment(authHeader);

    await seedTimeEntry(business_id, appointmentId, userId, "2026-01-15T10:00:00.000Z", "2026-01-15T12:00:00.000Z");

    const res = await request(app)
      .get("/api/timesheets/export.csv?start=2026-01-01&end=2026-01-31")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toContain("timesheet-2026-01-01-to-2026-01-31.csv");
    expect(res.text).toContain("Team Member,Hours,Sessions,Pay,Still Clocked In");
    expect(res.text).toContain("2.00,1,30.00");

  });

});
