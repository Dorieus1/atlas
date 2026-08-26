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


const getAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

};


const createAppointment = async (authHeader, title, hoursFromNow) => {

  const startTime = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();

  const res = await request(app)
    .post("/api/appointments")
    .set("Authorization", authHeader)
    .send({ title, start_time: startTime });

  return res.body.id;

};


describe("Calendar subscription feed", () => {

  test("requesting the feed token creates one, and requesting it again returns the same one", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "FeedTokenCreate");

    const first = await request(app)
      .get("/api/calendar/feed/token")
      .set("Authorization", authHeader);

    expect(first.status).toBe(200);
    expect(first.body.token).toBeTruthy();

    const second = await request(app)
      .get("/api/calendar/feed/token")
      .set("Authorization", authHeader);

    expect(second.body.token).toBe(first.body.token);

    const row = await getAsync("SELECT calendar_feed_token FROM businesses WHERE id = ?", [business_id]);
    expect(row.calendar_feed_token).toBe(first.body.token);

  });


  test("regenerating replaces the token, and the old one stops working", async () => {

    const { authHeader } = await createBusinessAndUser(app, "FeedTokenRegenerate");

    const before = await request(app)
      .get("/api/calendar/feed/token")
      .set("Authorization", authHeader);

    const oldToken = before.body.token;

    const regenerated = await request(app)
      .post("/api/calendar/feed/regenerate")
      .set("Authorization", authHeader);

    expect(regenerated.status).toBe(200);
    expect(regenerated.body.token).toBeTruthy();
    expect(regenerated.body.token).not.toBe(oldToken);

    const oldFeed = await request(app).get(`/api/calendar/feed/${oldToken}.ics`);
    expect(oldFeed.status).toBe(404);

    const newFeed = await request(app).get(`/api/calendar/feed/${regenerated.body.token}.ics`);
    expect(newFeed.status).toBe(200);

  });


  test("regenerating requires an owner - a staff member gets 403", async () => {

    const owner = await createBusinessAndUser(app, "FeedRegenerateGate");

    await request(app)
      .post("/api/auth/teammates")
      .set("Authorization", owner.authHeader)
      .send({ name: "Staffer", email: "feedgatestaff@test.com", password: "staffpass123" });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "feedgatestaff@test.com", password: "staffpass123" });

    const res = await request(app)
      .post("/api/calendar/feed/regenerate")
      .set("Authorization", `Bearer ${login.body.token}`);

    expect(res.status).toBe(403);

  });


  test("the feed contains upcoming appointments as valid ICS, and an unknown token 404s", async () => {

    const { authHeader } = await createBusinessAndUser(app, "FeedContent");

    await createAppointment(authHeader, "Roof inspection", 24);

    const tokenRes = await request(app)
      .get("/api/calendar/feed/token")
      .set("Authorization", authHeader);

    const feed = await request(app).get(`/api/calendar/feed/${tokenRes.body.token}.ics`);

    expect(feed.status).toBe(200);
    expect(feed.headers["content-type"]).toContain("text/calendar");
    expect(feed.text).toContain("BEGIN:VCALENDAR");
    expect(feed.text).toContain("BEGIN:VEVENT");
    expect(feed.text).toContain("SUMMARY:Roof inspection");
    expect(feed.text).toContain("END:VCALENDAR");

    const unknown = await request(app).get("/api/calendar/feed/not-a-real-token.ics");
    expect(unknown.status).toBe(404);

  });


  test("an appointment far enough in the past drops out of the feed", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "FeedOldAppointment");

    const oldAppointmentId = await createAppointment(authHeader, "Ancient job", 1);

    await runAsync(
      "UPDATE appointments SET start_time = ? WHERE id = ?",
      [new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), oldAppointmentId]
    );

    await createAppointment(authHeader, "Upcoming job", 24);

    const tokenRes = await request(app)
      .get("/api/calendar/feed/token")
      .set("Authorization", authHeader);

    const feed = await request(app).get(`/api/calendar/feed/${tokenRes.body.token}.ics`);

    expect(feed.text).toContain("SUMMARY:Upcoming job");
    expect(feed.text).not.toContain("SUMMARY:Ancient job");

    // business_id destructured only to make the fixture's intent clear -
    // isolation itself is exercised by the next test.
    expect(business_id).toBeTruthy();

  });


  test("one business's feed never includes another business's appointments", async () => {

    const bizA = await createBusinessAndUser(app, "FeedIsolationA");
    const bizB = await createBusinessAndUser(app, "FeedIsolationB");

    await createAppointment(bizA.authHeader, "A's job", 24);
    await createAppointment(bizB.authHeader, "B's job", 24);

    const tokenA = await request(app)
      .get("/api/calendar/feed/token")
      .set("Authorization", bizA.authHeader);

    const feedA = await request(app).get(`/api/calendar/feed/${tokenA.body.token}.ics`);

    expect(feedA.text).toContain("SUMMARY:A's job");
    expect(feedA.text).not.toContain("SUMMARY:B's job");

  });

});
