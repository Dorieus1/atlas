const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");

// Invites a second (staff) teammate into an already-created business and
// returns their user id - the owner created by createBusinessAndUser is
// one assignee, this gives a second, distinct one for conflict tests.
const inviteTeammate = async (app, ownerAuthHeader, prefix) => {

  const res = await request(app)
    .post("/api/auth/teammates")
    .set("Authorization", ownerAuthHeader)
    .send({
      name: `${prefix} Teammate`,
      email: `${prefix.toLowerCase()}@test.com`,
      password: "testpass123",
      role: "staff"
    });

  return res.body.id;

};


describe("Appointment assignment", () => {

  test("creating an appointment with a valid assigned_user_id succeeds and it's returned on later fetches", async () => {

    const { authHeader, userId } = await createBusinessAndUser(app, "AssignValid");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Gutter cleaning",
        start_time: "2026-09-01T10:00:00.000Z",
        assigned_user_id: userId
      });

    expect(created.status).toBe(201);

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    expect(list.body[0].assigned_user_id).toBe(userId);

  });


  test("an assigned_user_id belonging to a different business is rejected with 400", async () => {

    const bizA = await createBusinessAndUser(app, "AssignCrossA");
    const bizB = await createBusinessAndUser(app, "AssignCrossB");

    const attempt = await request(app)
      .post("/api/appointments")
      .set("Authorization", bizA.authHeader)
      .send({
        title: "Sneaky assignment",
        start_time: "2026-09-01T10:00:00.000Z",
        assigned_user_id: bizB.userId
      });

    expect(attempt.status).toBe(400);

  });


  test("two overlapping appointments assigned to the SAME person are flagged as conflicting", async () => {

    const { authHeader, userId } = await createBusinessAndUser(app, "AssignSamePerson");

    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Morning job",
        start_time: "2026-09-01T10:00:00.000Z",
        end_time: "2026-09-01T11:00:00.000Z",
        assigned_user_id: userId
      });

    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Overlapping job, same person",
        start_time: "2026-09-01T10:30:00.000Z",
        end_time: "2026-09-01T11:30:00.000Z",
        assigned_user_id: userId
      });

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const byTitle = Object.fromEntries(list.body.map((a) => [a.title, a.has_conflict]));

    expect(byTitle["Morning job"]).toBe(true);
    expect(byTitle["Overlapping job, same person"]).toBe(true);

  });


  test("two overlapping appointments assigned to DIFFERENT people are NOT flagged as conflicting", async () => {

    const { authHeader, userId: ownerId } = await createBusinessAndUser(app, "AssignDiffPeople");
    const staffId = await inviteTeammate(app, authHeader, "AssignDiffPeopleStaff");

    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Owner's job",
        start_time: "2026-09-01T10:00:00.000Z",
        end_time: "2026-09-01T11:00:00.000Z",
        assigned_user_id: ownerId
      });

    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Staff's job, same time",
        start_time: "2026-09-01T10:00:00.000Z",
        end_time: "2026-09-01T11:00:00.000Z",
        assigned_user_id: staffId
      });

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const byTitle = Object.fromEntries(list.body.map((a) => [a.title, a.has_conflict]));

    expect(byTitle["Owner's job"]).toBe(false);
    expect(byTitle["Staff's job, same time"]).toBe(false);

  });


  test("two overlapping UNASSIGNED appointments are still flagged as conflicting (regression safety)", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AssignUnassignedRegression");

    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Unassigned first",
        start_time: "2026-09-01T10:00:00.000Z",
        end_time: "2026-09-01T11:00:00.000Z"
      });

    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Unassigned overlapping",
        start_time: "2026-09-01T10:30:00.000Z",
        end_time: "2026-09-01T11:30:00.000Z"
      });

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const byTitle = Object.fromEntries(list.body.map((a) => [a.title, a.has_conflict]));

    expect(byTitle["Unassigned first"]).toBe(true);
    expect(byTitle["Unassigned overlapping"]).toBe(true);

  });


  test("an overlap between one assigned and one unassigned appointment IS flagged", async () => {

    const { authHeader, userId } = await createBusinessAndUser(app, "AssignMixed");

    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Assigned job",
        start_time: "2026-09-01T10:00:00.000Z",
        end_time: "2026-09-01T11:00:00.000Z",
        assigned_user_id: userId
      });

    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Unassigned overlap",
        start_time: "2026-09-01T10:30:00.000Z",
        end_time: "2026-09-01T11:30:00.000Z"
      });

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const byTitle = Object.fromEntries(list.body.map((a) => [a.title, a.has_conflict]));

    expect(byTitle["Assigned job"]).toBe(true);
    expect(byTitle["Unassigned overlap"]).toBe(true);

  });


  test("a recurring series shares one assignee across every occurrence", async () => {

    const { authHeader, userId } = await createBusinessAndUser(app, "AssignRecurring");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Weekly mowing",
        start_time: "2026-09-01T10:00:00.000Z",
        recurrence: "weekly",
        occurrences: 3,
        assigned_user_id: userId
      });

    expect(created.status).toBe(201);

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const series = list.body.filter((a) => a.recurrence_id === created.body.recurrence_id);

    expect(series.length).toBe(3);
    series.forEach((a) => {
      expect(a.assigned_user_id).toBe(userId);
    });

  });


  test("reassigning an existing appointment to someone else works and correctly changes which appointments it conflicts with", async () => {

    const { authHeader, userId: ownerId } = await createBusinessAndUser(app, "AssignReassign");
    const staffId = await inviteTeammate(app, authHeader, "AssignReassignStaff");

    // Owner's existing job, 10:00-11:00.
    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Owner's existing job",
        start_time: "2026-09-01T10:00:00.000Z",
        end_time: "2026-09-01T11:00:00.000Z",
        assigned_user_id: ownerId
      });

    // A second job, initially unassigned, overlapping the owner's job -
    // conflicts with the owner's job under the unassigned-conflicts-with-
    // anything rule.
    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Movable job",
        start_time: "2026-09-01T10:30:00.000Z",
        end_time: "2026-09-01T11:30:00.000Z"
      });

    const apptId = created.body.id;

    const beforeList = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const beforeByTitle = Object.fromEntries(beforeList.body.map((a) => [a.title, a.has_conflict]));
    expect(beforeByTitle["Owner's existing job"]).toBe(true);
    expect(beforeByTitle["Movable job"]).toBe(true);

    // Reassign the movable job to the staff member - it should no longer
    // conflict with the owner's job, since they're now two different
    // specific people.
    const reassign = await request(app)
      .patch(`/api/appointments/${apptId}`)
      .set("Authorization", authHeader)
      .send({ status: "scheduled", assigned_user_id: staffId });

    expect(reassign.status).toBe(200);

    const afterList = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const afterById = Object.fromEntries(afterList.body.map((a) => [a.id, a]));
    const afterByTitle = Object.fromEntries(afterList.body.map((a) => [a.title, a.has_conflict]));

    expect(afterById[apptId].assigned_user_id).toBe(staffId);
    expect(afterByTitle["Owner's existing job"]).toBe(false);
    expect(afterByTitle["Movable job"]).toBe(false);

  });

});
