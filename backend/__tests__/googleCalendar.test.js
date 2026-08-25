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


const allAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {

    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));

  });

};


// Invites a teammate (optionally with an explicit role) and logs them in -
// same pattern as userRoles.test.js's inviteAndLogin.
const inviteAndLogin = async (owner, prefix, role) => {

  const email = `${prefix.toLowerCase()}@test.com`;
  const password = "teammatepass123";

  await request(app)
    .post("/api/auth/teammates")
    .set("Authorization", owner.authHeader)
    .send({
      name: prefix,
      email,
      password,
      ...(role !== undefined ? { role } : {})
    });

  const login = await request(app)
    .post("/api/auth/login")
    .send({ email, password });

  return {
    business_id: owner.business_id,
    token: login.body.token,
    authHeader: `Bearer ${login.body.token}`,
    userId: login.body.user.id
  };

};


// Bypasses the OAuth round-trip entirely for tests that only care about
// appointment-sync behavior once a business is already connected -
// directly writes the same DB state the real callback would have.
const connectGoogleCalendar = (business_id, email = "owner@example.com", refreshToken = "refresh_test_123") => {

  return runAsync(

    `UPDATE businesses SET google_calendar_connected = 1, google_refresh_token = ?, google_calendar_email = ? WHERE id = ?`,

    [refreshToken, email, business_id]

  );

};


// Drives the real connect -> callback round trip through the mocked
// googleapis client, returning the callback response (a redirect) so
// callers can assert on it.
const runOAuthRoundTrip = async (authHeader) => {

  const connect = await request(app)
    .get("/api/calendar/google/connect")
    .set("Authorization", authHeader);

  const lastCall = global.__mockGoogleCalendar.generateAuthUrl.mock.calls.at(-1);
  const state = lastCall[0].state;

  const callback = await request(app)
    .get("/api/calendar/google/callback")
    .query({ code: "test_auth_code", state });

  return { connect, callback, state };

};


// Appointment-to-Google-Calendar sync is detached, not awaited in the
// request path (it must never add Google's own latency to an appointment
// response) - so a test needs to poll for the mocked call / DB write to
// actually land instead of asserting immediately after the HTTP response
// returns. Same reasoning and shape as knowledgeGaps.test.js's
// waitForGaps() for the equally-detached knowledge-gap detection.
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

  global.__mockGoogleCalendar.generateAuthUrl.mockClear();
  global.__mockGoogleCalendar.getToken.mockClear();
  global.__mockGoogleCalendar.setCredentials.mockClear();
  global.__mockGoogleCalendar.userinfoGet.mockClear();
  global.__mockGoogleCalendar.eventsInsert.mockClear();
  global.__mockGoogleCalendar.eventsUpdate.mockClear();
  global.__mockGoogleCalendar.eventsDelete.mockClear();

  global.__mockGoogleCalendar.generateAuthUrl.mockReturnValue("https://accounts.google.com/o/oauth2/v2/auth?mock=1");
  global.__mockGoogleCalendar.getToken.mockResolvedValue({ tokens: { refresh_token: "refresh_test_123", access_token: "access_test_123" } });
  global.__mockGoogleCalendar.userinfoGet.mockResolvedValue({ data: { email: "owner@example.com" } });
  global.__mockGoogleCalendar.eventsInsert.mockResolvedValue({ data: { id: "gcal_event_test_123" } });
  global.__mockGoogleCalendar.eventsUpdate.mockResolvedValue({ data: { id: "gcal_event_test_123" } });
  global.__mockGoogleCalendar.eventsDelete.mockResolvedValue({ data: {} });

});


describe("Google Calendar connect / callback / status / disconnect", () => {

  test("connect requires an owner - a staff member gets 403", async () => {

    const owner = await createBusinessAndUser(app, "GCalOwnerGate");
    const staff = await inviteAndLogin(owner, "GCalStaffGate", "staff");

    const res = await request(app)
      .get("/api/calendar/google/connect")
      .set("Authorization", staff.authHeader);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/owner/i);
    expect(global.__mockGoogleCalendar.generateAuthUrl).not.toHaveBeenCalled();

  });


  test("a fresh business isn't connected yet", async () => {

    const owner = await createBusinessAndUser(app, "GCalFresh");

    const status = await request(app)
      .get("/api/calendar/google/status")
      .set("Authorization", owner.authHeader);

    expect(status.status).toBe(200);
    expect(status.body.connected).toBe(false);
    expect(status.body.email).toBeFalsy();

  });


  test("the OAuth callback stores the refresh token/email and flips connected on, reflected by status", async () => {

    const owner = await createBusinessAndUser(app, "GCalCallback");

    const { connect, callback } = await runOAuthRoundTrip(owner.authHeader);

    expect(connect.status).toBe(200);
    expect(connect.body.url).toBe("https://accounts.google.com/o/oauth2/v2/auth?mock=1");

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toMatch(/\/settings\?google_calendar=connected/);

    expect(global.__mockGoogleCalendar.getToken).toHaveBeenCalledTimes(1);

    const row = await getAsync(
      "SELECT google_calendar_connected, google_refresh_token, google_calendar_email FROM businesses WHERE id = ?",
      [owner.business_id]
    );

    expect(row.google_calendar_connected).toBe(1);
    expect(row.google_refresh_token).toBe("refresh_test_123");
    expect(row.google_calendar_email).toBe("owner@example.com");

    const status = await request(app)
      .get("/api/calendar/google/status")
      .set("Authorization", owner.authHeader);

    expect(status.body.connected).toBe(true);
    expect(status.body.email).toBe("owner@example.com");

  });


  test("a callback with a missing or invalid state redirects with an error, and doesn't connect anything", async () => {

    const owner = await createBusinessAndUser(app, "GCalBadState");

    const callback = await request(app)
      .get("/api/calendar/google/callback")
      .query({ code: "test_auth_code", state: "not-a-real-token" });

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toMatch(/\/settings\?google_calendar=error/);

    const status = await request(app)
      .get("/api/calendar/google/status")
      .set("Authorization", owner.authHeader);

    expect(status.body.connected).toBe(false);

  });


  test("disconnecting clears the stored refresh token/email and flips connected off", async () => {

    const owner = await createBusinessAndUser(app, "GCalDisconnect");

    await runOAuthRoundTrip(owner.authHeader);

    const disconnect = await request(app)
      .post("/api/calendar/google/disconnect")
      .set("Authorization", owner.authHeader);

    expect(disconnect.status).toBe(200);

    const row = await getAsync(
      "SELECT google_calendar_connected, google_refresh_token, google_calendar_email FROM businesses WHERE id = ?",
      [owner.business_id]
    );

    expect(row.google_calendar_connected).toBe(0);
    expect(row.google_refresh_token).toBeNull();
    expect(row.google_calendar_email).toBeNull();

    const status = await request(app)
      .get("/api/calendar/google/status")
      .set("Authorization", owner.authHeader);

    expect(status.body.connected).toBe(false);

  });


  test("disconnect also requires an owner - a staff member gets 403", async () => {

    const owner = await createBusinessAndUser(app, "GCalDisconnectGate");
    const staff = await inviteAndLogin(owner, "GCalDisconnectStaff", "staff");

    await connectGoogleCalendar(owner.business_id);

    const res = await request(app)
      .post("/api/calendar/google/disconnect")
      .set("Authorization", staff.authHeader);

    expect(res.status).toBe(403);

    const row = await getAsync("SELECT google_calendar_connected FROM businesses WHERE id = ?", [owner.business_id]);
    expect(row.google_calendar_connected).toBe(1);

  });

});


describe("Google Calendar sync on appointment create/update/delete", () => {

  test("creating an appointment for a connected business creates a calendar event and stores google_event_id", async () => {

    const owner = await createBusinessAndUser(app, "GCalApptCreate");
    await connectGoogleCalendar(owner.business_id);

    const res = await request(app)
      .post("/api/appointments")
      .set("Authorization", owner.authHeader)
      .send({ title: "Roof inspection", start_time: "2026-09-01T15:00:00.000Z" });

    expect(res.status).toBe(201);

    await waitFor(() => global.__mockGoogleCalendar.eventsInsert.mock.calls.length > 0);

    expect(global.__mockGoogleCalendar.eventsInsert).toHaveBeenCalledTimes(1);

    const insertArgs = global.__mockGoogleCalendar.eventsInsert.mock.calls[0][0];
    expect(insertArgs.calendarId).toBe("primary");
    expect(insertArgs.requestBody.summary).toBe("Roof inspection");

    const row = await waitFor(async () => {
      const r = await getAsync("SELECT google_event_id FROM appointments WHERE id = ?", [res.body.id]);
      return r.google_event_id ? r : null;
    });

    expect(row.google_event_id).toBe("gcal_event_test_123");

  });


  test("creating an appointment for a business without Google Calendar connected does nothing calendar-related and doesn't error", async () => {

    const owner = await createBusinessAndUser(app, "GCalApptNoConnect");

    const res = await request(app)
      .post("/api/appointments")
      .set("Authorization", owner.authHeader)
      .send({ title: "Gutter cleaning", start_time: "2026-09-02T15:00:00.000Z" });

    expect(res.status).toBe(201);

    // Nothing to poll for here (this asserts an absence) - a short fixed
    // wait is the right tool instead of waitFor, just enough for any
    // stray detached call to have had a chance to fire if the code were
    // wrong.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(global.__mockGoogleCalendar.eventsInsert).not.toHaveBeenCalled();

    const row = await getAsync("SELECT google_event_id FROM appointments WHERE id = ?", [res.body.id]);
    expect(row.google_event_id).toBeNull();

  });


  test("a mocked Google API failure during appointment creation does NOT fail the appointment creation itself", async () => {

    const owner = await createBusinessAndUser(app, "GCalApptFail");
    await connectGoogleCalendar(owner.business_id);

    global.__mockGoogleCalendar.eventsInsert.mockRejectedValueOnce(new Error("Google is down"));

    const res = await request(app)
      .post("/api/appointments")
      .set("Authorization", owner.authHeader)
      .send({ title: "Siding repair", start_time: "2026-09-03T15:00:00.000Z" });

    // The appointment itself is still created successfully - the Google
    // failure is only logged, never surfaced back into this response.
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();

    const row = await getAsync("SELECT google_event_id FROM appointments WHERE id = ?", [res.body.id]);
    expect(row.google_event_id).toBeNull();

  });


  test("updating a synced appointment's status updates the linked calendar event", async () => {

    const owner = await createBusinessAndUser(app, "GCalApptUpdate");
    await connectGoogleCalendar(owner.business_id);

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", owner.authHeader)
      .send({ title: "Window replacement", start_time: "2026-09-04T15:00:00.000Z" });

    // The create's own sync must finish and set google_event_id before
    // the update below has anything to update.
    await waitFor(async () => {
      const r = await getAsync("SELECT google_event_id FROM appointments WHERE id = ?", [created.body.id]);
      return r.google_event_id ? r : null;
    });

    global.__mockGoogleCalendar.eventsUpdate.mockClear();

    const updated = await request(app)
      .patch(`/api/appointments/${created.body.id}`)
      .set("Authorization", owner.authHeader)
      .send({ status: "completed" });

    expect(updated.status).toBe(200);

    await waitFor(() => global.__mockGoogleCalendar.eventsUpdate.mock.calls.length > 0);

    expect(global.__mockGoogleCalendar.eventsUpdate).toHaveBeenCalledTimes(1);

    const updateArgs = global.__mockGoogleCalendar.eventsUpdate.mock.calls[0][0];
    expect(updateArgs.eventId).toBe("gcal_event_test_123");

  });


  test("cancelling (deleting) a synced appointment deletes the linked calendar event", async () => {

    const owner = await createBusinessAndUser(app, "GCalApptDelete");
    await connectGoogleCalendar(owner.business_id);

    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", owner.authHeader)
      .send({ title: "Deck staining", start_time: "2026-09-05T15:00:00.000Z" });

    // The create's own sync must finish and set google_event_id before
    // there's anything for the delete below to push a delete for.
    await waitFor(async () => {
      const r = await getAsync("SELECT google_event_id FROM appointments WHERE id = ?", [created.body.id]);
      return r.google_event_id ? r : null;
    });

    const deleted = await request(app)
      .delete(`/api/appointments/${created.body.id}`)
      .set("Authorization", owner.authHeader);

    expect(deleted.status).toBe(200);

    await waitFor(() => global.__mockGoogleCalendar.eventsDelete.mock.calls.length > 0);

    expect(global.__mockGoogleCalendar.eventsDelete).toHaveBeenCalledTimes(1);

    const deleteArgs = global.__mockGoogleCalendar.eventsDelete.mock.calls[0][0];
    expect(deleteArgs.eventId).toBe("gcal_event_test_123");

  });


  test("a recurring appointment series with Google Calendar connected creates one calendar event per occurrence", async () => {

    const owner = await createBusinessAndUser(app, "GCalRecurring");
    await connectGoogleCalendar(owner.business_id);

    const res = await request(app)
      .post("/api/appointments")
      .set("Authorization", owner.authHeader)
      .send({
        title: "Weekly lawn care",
        start_time: "2026-09-07T15:00:00.000Z",
        recurrence: "weekly",
        occurrences: 3
      });

    expect(res.status).toBe(201);
    expect(res.body.ids).toHaveLength(3);

    await waitFor(() => global.__mockGoogleCalendar.eventsInsert.mock.calls.length >= 3);

    expect(global.__mockGoogleCalendar.eventsInsert).toHaveBeenCalledTimes(3);

    const rows = await waitFor(async () => {
      const r = await allAsync(
        `SELECT google_event_id FROM appointments WHERE id IN (?, ?, ?)`,
        res.body.ids
      );
      return r.every((row) => row.google_event_id) ? r : null;
    });

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.google_event_id).toBe("gcal_event_test_123");
    }

  });

});
