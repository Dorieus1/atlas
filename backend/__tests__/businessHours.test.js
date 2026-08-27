const request = require("supertest");
const app = require("../server");
const { flushBackgroundWork } = require("../services/chatService");
const { createBusinessAndUser } = require("./setup/helpers");


const WEEKDAY_HOURS = {
  mon: { open: "09:00", close: "17:00" },
  tue: { open: "09:00", close: "17:00" },
  wed: { open: "09:00", close: "17:00" },
  thu: { open: "09:00", close: "17:00" },
  fri: { open: "09:00", close: "17:00" },
  sat: null,
  sun: null
};


const setBusinessHours = async (authHeader, businessName, businessHours) => {

  return request(app)
    .put("/api/business")
    .set("Authorization", authHeader)
    .send({ name: businessName, business_hours: businessHours });

};


const extractToken = () => {

  const lastCall = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
  const body = JSON.parse(lastCall[1].body);
  const match = body.html.match(/token=([a-f0-9]+)/);

  return match ? match[1] : null;

};


const loginAsCustomer = async (slug, email) => {

  await request(app)
    .post(`/api/portal/${slug}/login`)
    .send({ email });

  const token = extractToken();

  const verify = await request(app)
    .post(`/api/portal/${slug}/verify`)
    .send({ token });

  return `Bearer ${verify.body.token}`;

};


const getSlug = async (authHeader) => {

  const res = await request(app)
    .get("/api/business")
    .set("Authorization", authHeader);

  return res.body[0].slug;

};


describe("Business hours", () => {

  beforeEach(() => {
    global.fetch.mockClear();
  });


  test("a business with no hours configured accepts a portal request at any time", async () => {

    const { authHeader } = await createBusinessAndUser(app, "HoursUnset");
    const slug = await getSlug(authHeader);

    await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Any Time Customer", email: "anytime@test.com" });

    const customerAuthHeader = await loginAsCustomer(slug, "anytime@test.com");

    // 2026-09-14 is a Monday. 3am is well outside any normal business
    // hours, but nothing has been configured, so it must go through.
    const res = await request(app)
      .post("/api/portal/account/appointments")
      .set("Authorization", customerAuthHeader)
      .send({ title: "Late night leak", start_time: "2026-09-14T03:00:00.000Z" });

    expect(res.status).toBe(201);

  });


  test("a request outside configured hours is rejected with a clear error", async () => {

    const { authHeader } = await createBusinessAndUser(app, "HoursOutside");
    const slug = await getSlug(authHeader);

    const setRes = await setBusinessHours(authHeader, "HoursOutside Business", WEEKDAY_HOURS);
    expect(setRes.status).toBe(200);

    await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Outside Customer", email: "outside@test.com" });

    const customerAuthHeader = await loginAsCustomer(slug, "outside@test.com");

    // Monday 3am - outside the 9-5 window.
    const res = await request(app)
      .post("/api/portal/account/appointments")
      .set("Authorization", customerAuthHeader)
      .send({ title: "Too early", start_time: "2026-09-14T03:00:00.000Z" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/09:00/);
    expect(res.body.error).toMatch(/17:00/);
    expect(res.body.error.toLowerCase()).toMatch(/monday/);

  });


  test("a request inside configured hours is accepted", async () => {

    const { authHeader } = await createBusinessAndUser(app, "HoursInside");
    const slug = await getSlug(authHeader);

    const setRes = await setBusinessHours(authHeader, "HoursInside Business", WEEKDAY_HOURS);
    expect(setRes.status).toBe(200);

    await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Inside Customer", email: "inside@test.com" });

    const customerAuthHeader = await loginAsCustomer(slug, "inside@test.com");

    // Monday 2pm - well within the 9-5 window.
    const res = await request(app)
      .post("/api/portal/account/appointments")
      .set("Authorization", customerAuthHeader)
      .send({ title: "Right on time", start_time: "2026-09-14T14:00:00.000Z" });

    expect(res.status).toBe(201);

  });


  test("a day marked closed rejects any request that day", async () => {

    const { authHeader } = await createBusinessAndUser(app, "HoursClosedDay");
    const slug = await getSlug(authHeader);

    const setRes = await setBusinessHours(authHeader, "HoursClosedDay Business", WEEKDAY_HOURS);
    expect(setRes.status).toBe(200);

    await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Weekend Customer", email: "weekend@test.com" });

    const customerAuthHeader = await loginAsCustomer(slug, "weekend@test.com");

    // 2026-09-12 is a Saturday, marked null (closed) in WEEKDAY_HOURS.
    const res = await request(app)
      .post("/api/portal/account/appointments")
      .set("Authorization", customerAuthHeader)
      .send({ title: "Weekend job", start_time: "2026-09-12T14:00:00.000Z" });

    expect(res.status).toBe(400);
    expect(res.body.error.toLowerCase()).toMatch(/closed/);
    expect(res.body.error.toLowerCase()).toMatch(/saturday/);

  });


  test("a malformed hours payload on the settings-update endpoint is rejected with 400", async () => {

    const { authHeader } = await createBusinessAndUser(app, "HoursMalformed");

    const badTimeFormat = await setBusinessHours(authHeader, "HoursMalformed Business", {
      mon: { open: "9am", close: "5pm" }
    });

    expect(badTimeFormat.status).toBe(400);

    const openAfterClose = await setBusinessHours(authHeader, "HoursMalformed Business", {
      mon: { open: "17:00", close: "09:00" }
    });

    expect(openAfterClose.status).toBe(400);

    const unknownDay = await setBusinessHours(authHeader, "HoursMalformed Business", {
      monday: { open: "09:00", close: "17:00" }
    });

    expect(unknownDay.status).toBe(400);

    const notAnObject = await setBusinessHours(authHeader, "HoursMalformed Business", "always open");

    expect(notAnObject.status).toBe(400);

    // None of the bad payloads above should have taken effect - hours
    // should still be unconfigured (nothing enforced).
    const slug = await getSlug(authHeader);

    await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Still Unset Customer", email: "stillunset@test.com" });

    const customerAuthHeader = await loginAsCustomer(slug, "stillunset@test.com");

    const stillUnrestricted = await request(app)
      .post("/api/portal/account/appointments")
      .set("Authorization", customerAuthHeader)
      .send({ title: "Any time still works", start_time: "2026-09-14T03:00:00.000Z" });

    expect(stillUnrestricted.status).toBe(201);

  });


  test("internal staff-facing appointment creation is not restricted by business hours", async () => {

    const { authHeader } = await createBusinessAndUser(app, "HoursStaffOverride");

    const setRes = await setBusinessHours(authHeader, "HoursStaffOverride Business", WEEKDAY_HOURS);
    expect(setRes.status).toBe(200);

    // Monday 3am - would be rejected on the portal path, but staff can
    // schedule outside normal hours directly.
    const res = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ title: "Emergency callout", start_time: "2026-09-14T03:00:00.000Z" });

    expect(res.status).toBe(201);

    // Saturday, marked closed - also unrestricted for staff.
    const closedDayRes = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ title: "Saturday job", start_time: "2026-09-12T14:00:00.000Z" });

    expect(closedDayRes.status).toBe(201);

  });


  // Regression tests for a real gap found during the design critique:
  // these structured hours are already the thing that enforces portal
  // booking above, but the AI chat that answers a customer's own
  // questions never saw them at all - it only knew hours if the owner
  // separately retyped them into a free-text Knowledge Base entry.
  describe("AI chat grounding", () => {

    beforeEach(() => {
      // mockReset (not mockClear) so no queued `mockResolvedValueOnce`
      // from another test's detached lead-/gap-detection call survives
      // into this one.
      global.__mockOpenAICreate.mockReset();
      global.__mockOpenAICreate.mockResolvedValue({ output_text: "We're open Monday 09:00-17:00." });
    });

    afterEach(async () => {
      await flushBackgroundWork();
    });

    test("structured business hours reach the AI's instructions without any Knowledge Base entry", async () => {

      const { authHeader } = await createBusinessAndUser(app, "HoursAIGrounded");

      const setRes = await setBusinessHours(authHeader, "HoursAIGrounded Business", WEEKDAY_HOURS);
      expect(setRes.status).toBe(200);

      const customerRes = await request(app)
        .post("/api/customers")
        .set("Authorization", authHeader)
        .send({ name: "AI Hours Customer" });

      await request(app)
        .post("/api/chat")
        .set("Authorization", authHeader)
        .send({ customer_id: customerRes.body.id, message: "What are your hours?" });

      const callArgs = global.__mockOpenAICreate.mock.calls[0][0];

      expect(callArgs.instructions).toContain("Monday: 09:00-17:00");
      expect(callArgs.instructions).toContain("Saturday: Closed");
      expect(callArgs.instructions).toContain("Sunday: Closed");

      // Regression check for a real bug a second review round found:
      // reciting "Saturday: Closed" correctly didn't stop the model from
      // then inventing a "9am-2pm by appointment" exception for it
      // anyway - grounding data reaching the prompt isn't the same as
      // an instruction not to embellish past it. This exact phrase
      // (added in aiService.js's shared instructions, not repeated per
      // caller) is what's supposed to stop that.
      expect(callArgs.instructions).toContain("if a day is listed as Closed, say it's closed");

    });


    test("a business with no hours configured gets a plain 'not specified' instead of a crash", async () => {

      const { authHeader } = await createBusinessAndUser(app, "HoursAINotConfigured");

      const customerRes = await request(app)
        .post("/api/customers")
        .set("Authorization", authHeader)
        .send({ name: "AI No Hours Customer" });

      await request(app)
        .post("/api/chat")
        .set("Authorization", authHeader)
        .send({ customer_id: customerRes.body.id, message: "What are your hours?" });

      const callArgs = global.__mockOpenAICreate.mock.calls[0][0];

      expect(callArgs.instructions).toContain("Business Hours:\nNot specified.");

    });

  });

});
