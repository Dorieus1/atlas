const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");

describe("Recurring appointments", () => {

  test("a weekly recurring appointment creates exactly N rows, sharing one recurrence_id, spaced 7 days apart", async () => {

    const { authHeader } = await createBusinessAndUser(app, "RecurWeekly");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Biweekly lawn care",
        start_time: "2026-09-01T10:00:00.000Z",
        recurrence: "weekly",
        occurrences: 4
      });

    expect(created.status).toBe(201);
    expect(created.body.ids.length).toBe(4);
    expect(created.body.recurrence_id).toBeTruthy();

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const series = list.body.filter((a) => a.recurrence_id === created.body.recurrence_id);

    expect(series.length).toBe(4);

    const recurrenceIds = new Set(series.map((a) => a.recurrence_id));
    expect(recurrenceIds.size).toBe(1);

    const starts = series
      .map((a) => new Date(a.start_time).getTime())
      .sort((a, b) => a - b);

    for (let i = 1; i < starts.length; i++) {
      const diffDays = (starts[i] - starts[i - 1]) / (24 * 60 * 60 * 1000);
      expect(diffDays).toBe(7);
    }

    series.forEach((a) => {
      expect(a.title).toBe("Biweekly lawn care");
      expect(a.recurrence_rule).toBe("weekly");
      expect(a.status).toBe("scheduled");
    });

  });


  test("a biweekly recurrence spaces occurrences 14 days apart", async () => {

    const { authHeader } = await createBusinessAndUser(app, "RecurBiweekly");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "HVAC check",
        start_time: "2026-09-01T09:00:00.000Z",
        recurrence: "biweekly",
        occurrences: 3
      });

    expect(created.status).toBe(201);

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const series = list.body
      .filter((a) => a.recurrence_id === created.body.recurrence_id)
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    expect(series.length).toBe(3);
    expect(new Date(series[1].start_time) - new Date(series[0].start_time)).toBe(14 * 24 * 60 * 60 * 1000);
    expect(new Date(series[2].start_time) - new Date(series[1].start_time)).toBe(14 * 24 * 60 * 60 * 1000);

  });


  test("a monthly recurrence starting Jan 31 clamps to the last valid day of shorter months", async () => {

    const { authHeader } = await createBusinessAndUser(app, "RecurMonthlyClamp");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Monthly maintenance",
        start_time: "2027-01-31T15:00:00.000Z",
        recurrence: "monthly",
        occurrences: 4
      });

    expect(created.status).toBe(201);

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const series = list.body
      .filter((a) => a.recurrence_id === created.body.recurrence_id)
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    expect(series.length).toBe(4);

    // Each occurrence clamps the *original* day-of-month (31) to the
    // last valid day of its own target month - it does not chain off
    // the previous (possibly-clamped) occurrence. So: Jan 31 -> Feb 28
    // (2027 isn't a leap year, clamped from 31) -> Mar 31 (31 exists in
    // March, no clamping needed) -> Apr 30 (clamped from 31). Every
    // occurrence keeps the original time-of-day.
    expect(series[0].start_time.slice(0, 10)).toBe("2027-01-31");
    expect(series[1].start_time.slice(0, 10)).toBe("2027-02-28");
    expect(series[2].start_time.slice(0, 10)).toBe("2027-03-31");
    expect(series[3].start_time.slice(0, 10)).toBe("2027-04-30");

    series.forEach((a) => {
      expect(a.start_time.slice(11, 19)).toBe("15:00:00");
    });

  });


  test("requesting more than the occurrence cap is rejected with 400, and nothing is created", async () => {

    const { authHeader } = await createBusinessAndUser(app, "RecurCap");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Too many",
        start_time: "2026-09-01T10:00:00.000Z",
        recurrence: "weekly",
        occurrences: 25
      });

    expect(created.status).toBe(400);

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    expect(list.body.length).toBe(0);

  });


  test("an unrecognized recurrence value is rejected with 400", async () => {

    const { authHeader } = await createBusinessAndUser(app, "RecurBadRule");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Bad rule",
        start_time: "2026-09-01T10:00:00.000Z",
        recurrence: "daily",
        occurrences: 3
      });

    expect(created.status).toBe(400);

  });


  test("a non-recurring appointment (no recurrence option passed) behaves exactly as before", async () => {

    const { authHeader } = await createBusinessAndUser(app, "RecurRegression");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "One-off visit",
        start_time: "2026-09-01T10:00:00.000Z"
      });

    expect(created.status).toBe(201);
    expect(created.body.id).toBeTruthy();
    expect(created.body.ids).toBeUndefined();
    expect(created.body.recurrence_id).toBeUndefined();

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    expect(list.body.length).toBe(1);
    expect(list.body[0].recurrence_id).toBeFalsy();
    expect(list.body[0].recurrence_rule).toBeFalsy();

  });


  test("cancelling a single occurrence from a series only affects that one row", async () => {

    const { authHeader } = await createBusinessAndUser(app, "RecurCancelOne");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Weekly checkup",
        start_time: "2026-09-01T10:00:00.000Z",
        recurrence: "weekly",
        occurrences: 4
      });

    const targetId = created.body.ids[1];

    const cancel = await request(app)
      .patch(`/api/appointments/${targetId}`)
      .set("Authorization", authHeader)
      .send({ status: "cancelled" });

    expect(cancel.status).toBe(200);

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const series = Object.fromEntries(list.body.map((a) => [a.id, a.status]));

    expect(series[created.body.ids[0]]).toBe("scheduled");
    expect(series[created.body.ids[1]]).toBe("cancelled");
    expect(series[created.body.ids[2]]).toBe("scheduled");
    expect(series[created.body.ids[3]]).toBe("scheduled");

  });


  test("cancelling 'this and future' affects the right subset and leaves earlier occurrences untouched", async () => {

    const { authHeader } = await createBusinessAndUser(app, "RecurCancelFuture");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Weekly checkup",
        start_time: "2026-09-01T10:00:00.000Z",
        recurrence: "weekly",
        occurrences: 4
      });

    const targetId = created.body.ids[1];

    const cancel = await request(app)
      .patch(`/api/appointments/${targetId}`)
      .set("Authorization", authHeader)
      .send({ status: "cancelled", scope: "future" });

    expect(cancel.status).toBe(200);

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const byId = Object.fromEntries(list.body.map((a) => [a.id, a.status]));

    expect(byId[created.body.ids[0]]).toBe("scheduled");
    expect(byId[created.body.ids[1]]).toBe("cancelled");
    expect(byId[created.body.ids[2]]).toBe("cancelled");
    expect(byId[created.body.ids[3]]).toBe("cancelled");

  });


  test("deleting a single occurrence from a series only removes that one row", async () => {

    const { authHeader } = await createBusinessAndUser(app, "RecurDeleteOne");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Weekly checkup",
        start_time: "2026-09-01T10:00:00.000Z",
        recurrence: "weekly",
        occurrences: 4
      });

    const targetId = created.body.ids[2];

    const del = await request(app)
      .delete(`/api/appointments/${targetId}`)
      .set("Authorization", authHeader)
      .send({});

    expect(del.status).toBe(200);

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const remainingIds = list.body.map((a) => a.id);

    expect(remainingIds.length).toBe(3);
    expect(remainingIds).toContain(created.body.ids[0]);
    expect(remainingIds).toContain(created.body.ids[1]);
    expect(remainingIds).not.toContain(created.body.ids[2]);
    expect(remainingIds).toContain(created.body.ids[3]);

  });


  test("deleting 'this and future' removes the right subset and leaves earlier occurrences in place", async () => {

    const { authHeader } = await createBusinessAndUser(app, "RecurDeleteFuture");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Weekly checkup",
        start_time: "2026-09-01T10:00:00.000Z",
        recurrence: "weekly",
        occurrences: 4
      });

    const targetId = created.body.ids[2];

    const del = await request(app)
      .delete(`/api/appointments/${targetId}`)
      .set("Authorization", authHeader)
      .send({ scope: "future" });

    expect(del.status).toBe(200);

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const remainingIds = list.body.map((a) => a.id);

    expect(remainingIds.length).toBe(2);
    expect(remainingIds).toContain(created.body.ids[0]);
    expect(remainingIds).toContain(created.body.ids[1]);
    expect(remainingIds).not.toContain(created.body.ids[2]);
    expect(remainingIds).not.toContain(created.body.ids[3]);

  });


  test("a recurring appointment's individual occurrences still get flagged by conflict detection", async () => {

    const { authHeader } = await createBusinessAndUser(app, "RecurConflict");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Weekly checkup",
        start_time: "2026-09-01T10:00:00.000Z",
        end_time: "2026-09-01T11:00:00.000Z",
        recurrence: "weekly",
        occurrences: 3
      });

    // Overlaps the 2nd occurrence of the series, which lands on
    // 2026-09-08T10:00-11:00.
    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        title: "Walk-in job",
        start_time: "2026-09-08T10:30:00.000Z",
        end_time: "2026-09-08T11:30:00.000Z"
      });

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const byId = Object.fromEntries(list.body.map((a) => [a.id, a]));

    expect(byId[created.body.ids[0]].has_conflict).toBe(false);
    expect(byId[created.body.ids[1]].has_conflict).toBe(true);
    expect(byId[created.body.ids[2]].has_conflict).toBe(false);

    const walkIn = list.body.find((a) => a.title === "Walk-in job");
    expect(walkIn.has_conflict).toBe(true);

  });


  test("cancelling or deleting 'future' on a non-recurring appointment degrades safely to a single-row action", async () => {

    const { authHeader } = await createBusinessAndUser(app, "RecurScopeFallback");

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ title: "Plain appointment", start_time: "2026-09-01T10:00:00.000Z" });

    const cancel = await request(app)
      .patch(`/api/appointments/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ status: "cancelled", scope: "future" });

    expect(cancel.status).toBe(200);

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    expect(list.body.length).toBe(1);
    expect(list.body[0].status).toBe("cancelled");

  });

});
