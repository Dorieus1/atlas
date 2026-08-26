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


// Bypasses the real connect flow (PROPFIND discovery through the mocked
// fetch) for tests that only care about appointment-sync behavior once a
// business is already connected - same shortcut googleCalendar.test.js's
// connectGoogleCalendar takes.
const connectAppleCalendar = (business_id, email = "owner@icloud.com", appPassword = "abcd-efgh-ijkl-mnop") => {

  return runAsync(

    `UPDATE businesses SET apple_calendar_connected = 1, apple_calendar_email = ?, apple_calendar_app_password = ?, apple_calendar_url = ? WHERE id = ?`,

    [email, appPassword, global.__mockAppleCalendar.targetCalendarUrl, business_id]

  );

};


const waitFor = async (checkFn, { timeout = 1000, interval = 20 } = {}) => {

  const start = Date.now();

  while (true) {

    const result = await checkFn();

    if (result || Date.now() - start > timeout) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));

  }

};


beforeEach(() => {
  global.__mockAppleCalendar.reset();
  global.fetch.mockClear();
});


describe("Apple Calendar connect / status / disconnect", () => {

  test("connect requires an owner - a staff member gets 403", async () => {

    const owner = await createBusinessAndUser(app, "AppleGateOwner");

    await request(app)
      .post("/api/auth/teammates")
      .set("Authorization", owner.authHeader)
      .send({ name: "Staffer", email: "applestaff@test.com", password: "staffpass123" });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "applestaff@test.com", password: "staffpass123" });

    const res = await request(app)
      .post("/api/calendar/apple/connect")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ email: "owner@icloud.com", app_password: "abcd-efgh-ijkl-mnop" });

    expect(res.status).toBe(403);

  });


  test("a fresh business isn't connected yet", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AppleFresh");

    const res = await request(app)
      .get("/api/calendar/apple/status")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(false);
    expect(res.body.email).toBeNull();

  });


  test("missing email or app password is rejected before any discovery attempt", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AppleMissingFields");

    const res = await request(app)
      .post("/api/calendar/apple/connect")
      .set("Authorization", authHeader)
      .send({ email: "owner@icloud.com" });

    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();

  });


  test("connecting with valid credentials discovers the calendar and stores the connection", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "AppleConnect");

    const res = await request(app)
      .post("/api/calendar/apple/connect")
      .set("Authorization", authHeader)
      .send({ email: "owner@icloud.com", app_password: "abcd-efgh-ijkl-mnop" });

    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.email).toBe("owner@icloud.com");

    const row = await getAsync(
      "SELECT apple_calendar_connected, apple_calendar_email, apple_calendar_url FROM businesses WHERE id = ?",
      [business_id]
    );

    expect(row.apple_calendar_connected).toBe(1);
    expect(row.apple_calendar_email).toBe("owner@icloud.com");
    expect(row.apple_calendar_url).toBe(global.__mockAppleCalendar.targetCalendarUrl);

    const status = await request(app)
      .get("/api/calendar/apple/status")
      .set("Authorization", authHeader);

    expect(status.body.connected).toBe(true);
    expect(status.body.email).toBe("owner@icloud.com");

  });


  // 400, not 401 - a wrong Apple credential must never look like an
  // expired Atlas session to the frontend's global 401 handler (see
  // handleSessionExpired in atlasApi.js), which would otherwise log the
  // owner out of Atlas entirely just for mistyping an Apple ID password.
  test("connecting with a wrong Apple ID/app-specific password is rejected with a 400, and nothing is stored", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "AppleWrongPassword");

    global.__mockAppleCalendar.setAuthFailure(true);

    const res = await request(app)
      .post("/api/calendar/apple/connect")
      .set("Authorization", authHeader)
      .send({ email: "owner@icloud.com", app_password: "wrong-password" });

    expect(res.status).toBe(400);

    const row = await getAsync("SELECT apple_calendar_connected FROM businesses WHERE id = ?", [business_id]);
    expect(row.apple_calendar_connected).toBe(0);

  });


  test("disconnecting clears the stored connection", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "AppleDisconnect");
    await connectAppleCalendar(business_id);

    const res = await request(app)
      .post("/api/calendar/apple/disconnect")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);

    const row = await getAsync(
      "SELECT apple_calendar_connected, apple_calendar_app_password FROM businesses WHERE id = ?",
      [business_id]
    );

    expect(row.apple_calendar_connected).toBe(0);
    expect(row.apple_calendar_app_password).toBeNull();

  });


  test("disconnect also requires an owner", async () => {

    const owner = await createBusinessAndUser(app, "AppleDisconnectGate");
    await connectAppleCalendar(owner.business_id);

    await request(app)
      .post("/api/auth/teammates")
      .set("Authorization", owner.authHeader)
      .send({ name: "Staffer", email: "appledisconnectstaff@test.com", password: "staffpass123" });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "appledisconnectstaff@test.com", password: "staffpass123" });

    const res = await request(app)
      .post("/api/calendar/apple/disconnect")
      .set("Authorization", `Bearer ${login.body.token}`);

    expect(res.status).toBe(403);

    const row = await getAsync("SELECT apple_calendar_connected FROM businesses WHERE id = ?", [owner.business_id]);
    expect(row.apple_calendar_connected).toBe(1);

  });

});


describe("Apple Calendar sync on appointment create/update/delete", () => {

  test("creating an appointment for a connected business PUTs an .ics event to the discovered calendar", async () => {

    const owner = await createBusinessAndUser(app, "AppleApptCreate");
    await connectAppleCalendar(owner.business_id);

    const res = await request(app)
      .post("/api/appointments")
      .set("Authorization", owner.authHeader)
      .send({ title: "Roof inspection", start_time: "2026-09-01T15:00:00.000Z" });

    expect(res.status).toBe(201);

    await waitFor(() => global.__mockAppleCalendar.putCalls.length > 0);

    expect(global.__mockAppleCalendar.putCalls).toHaveLength(1);

    const put = global.__mockAppleCalendar.putCalls[0];
    expect(put.url).toBe(`${global.__mockAppleCalendar.targetCalendarUrl}${res.body.id}.ics`);
    expect(put.body).toContain(`UID:${res.body.id}@atlas.app`);
    expect(put.body).toContain("SUMMARY:Roof inspection");

  });


  test("creating an appointment for a business without Apple Calendar connected does nothing calendar-related", async () => {

    const owner = await createBusinessAndUser(app, "AppleApptNoConnect");

    const res = await request(app)
      .post("/api/appointments")
      .set("Authorization", owner.authHeader)
      .send({ title: "Gutter cleaning", start_time: "2026-09-02T15:00:00.000Z" });

    expect(res.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(global.__mockAppleCalendar.putCalls).toHaveLength(0);

  });


  test("a mocked Apple Calendar failure during appointment creation does NOT fail the appointment creation itself", async () => {

    const owner = await createBusinessAndUser(app, "AppleApptFail");
    await connectAppleCalendar(owner.business_id);

    global.__mockAppleCalendar.setAuthFailure(true);

    const res = await request(app)
      .post("/api/appointments")
      .set("Authorization", owner.authHeader)
      .send({ title: "Siding repair", start_time: "2026-09-03T15:00:00.000Z" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();

  });


  test("a revoked app-specific password auto-disconnects Apple Calendar and notifies the owner", async () => {

    const owner = await createBusinessAndUser(app, "AppleApptRevoked");
    await connectAppleCalendar(owner.business_id);

    global.__mockAppleCalendar.setAuthFailure(true);

    await request(app)
      .post("/api/appointments")
      .set("Authorization", owner.authHeader)
      .send({ title: "Chimney flashing", start_time: "2026-09-04T15:00:00.000Z" });

    const business = await waitFor(async () => {
      const r = await getAsync("SELECT apple_calendar_connected FROM businesses WHERE id = ?", [owner.business_id]);
      return r.apple_calendar_connected === 0 ? r : null;
    });

    expect(business.apple_calendar_connected).toBe(0);

    const notifications = await new Promise((resolve, reject) => {
      db.all("SELECT * FROM notifications WHERE business_id = ?", [owner.business_id], (err, rows) => (err ? reject(err) : resolve(rows)));
    });

    expect(notifications.some((n) => n.type === "calendar_disconnected" && n.title.includes("Apple"))).toBe(true);

  });


  test("updating a synced appointment's status PUTs the same event URL again", async () => {

    const owner = await createBusinessAndUser(app, "AppleApptUpdate");
    await connectAppleCalendar(owner.business_id);

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", owner.authHeader)
      .send({ title: "Deck staining", start_time: "2026-09-05T15:00:00.000Z" });

    await waitFor(() => global.__mockAppleCalendar.putCalls.length > 0);
    global.__mockAppleCalendar.putCalls.length = 0;

    await request(app)
      .patch(`/api/appointments/${created.body.id}`)
      .set("Authorization", owner.authHeader)
      .send({ status: "completed" });

    await waitFor(() => global.__mockAppleCalendar.putCalls.length > 0);

    expect(global.__mockAppleCalendar.putCalls[0].url).toBe(`${global.__mockAppleCalendar.targetCalendarUrl}${created.body.id}.ics`);

  });


  test("cancelling (deleting) a synced appointment DELETEs the same event URL", async () => {

    const owner = await createBusinessAndUser(app, "AppleApptDelete");
    await connectAppleCalendar(owner.business_id);

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", owner.authHeader)
      .send({ title: "Fence repair", start_time: "2026-09-06T15:00:00.000Z" });

    await waitFor(() => global.__mockAppleCalendar.putCalls.length > 0);

    await request(app)
      .delete(`/api/appointments/${created.body.id}`)
      .set("Authorization", owner.authHeader);

    await waitFor(() => global.__mockAppleCalendar.deleteCalls.length > 0);

    expect(global.__mockAppleCalendar.deleteCalls[0].url).toBe(`${global.__mockAppleCalendar.targetCalendarUrl}${created.body.id}.ics`);

  });

});
