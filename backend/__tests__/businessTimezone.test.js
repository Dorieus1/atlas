const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");


// Mon-Fri 09:00-17:00, closed weekends - same shape used in
// businessHours.test.js.
const WEEKDAY_HOURS = {
  mon: { open: "09:00", close: "17:00" },
  tue: { open: "09:00", close: "17:00" },
  wed: { open: "09:00", close: "17:00" },
  thu: { open: "09:00", close: "17:00" },
  fri: { open: "09:00", close: "17:00" },
  sat: null,
  sun: null
};


const updateBusiness = async (authHeader, businessName, extra) => {

  return request(app)
    .put("/api/business")
    .set("Authorization", authHeader)
    .send({ name: businessName, business_hours: WEEKDAY_HOURS, ...extra });

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


const getBusiness = async (authHeader) => {

  const res = await request(app)
    .get("/api/business")
    .set("Authorization", authHeader);

  return res.body[0];

};


describe("Business timezone", () => {

  beforeEach(() => {
    global.fetch.mockClear();
  });


  test("a business with no timezone set is compared in UTC, unchanged from before", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TzUnset");

    const setRes = await updateBusiness(authHeader, "TzUnset Business", {});
    expect(setRes.status).toBe(200);

    const business = await getBusiness(authHeader);
    expect(business.timezone).toBeFalsy();

    await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "UTC Customer", email: "tzunset@test.com" });

    const customerAuthHeader = await loginAsCustomer(business.slug, "tzunset@test.com");

    // 2026-01-15 is a Thursday. 14:00 UTC is within the 09:00-17:00
    // window when read directly as UTC - the pre-timezone behavior.
    const inside = await request(app)
      .post("/api/portal/account/appointments")
      .set("Authorization", customerAuthHeader)
      .send({ title: "Within UTC hours", start_time: "2026-01-15T14:00:00.000Z" });

    expect(inside.status).toBe(201);

    // 03:00 UTC on the same Thursday is outside the 09:00-17:00 UTC
    // window.
    const outside = await request(app)
      .post("/api/portal/account/appointments")
      .set("Authorization", customerAuthHeader)
      .send({ title: "Outside UTC hours", start_time: "2026-01-15T03:00:00.000Z" });

    expect(outside.status).toBe(400);

  });


  test("a request outside hours in UTC but inside hours in local time (New York) is accepted", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TzAcceptLocal");

    const setRes = await updateBusiness(authHeader, "TzAcceptLocal Business", { timezone: "America/New_York" });
    expect(setRes.status).toBe(200);

    const business = await getBusiness(authHeader);
    expect(business.timezone).toBe("America/New_York");

    await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "NY Customer", email: "tzacceptlocal@test.com" });

    const customerAuthHeader = await loginAsCustomer(business.slug, "tzacceptlocal@test.com");

    // 2026-01-15T20:00:00Z is a Thursday. In January, America/New_York is
    // UTC-5 (EST, no DST in effect), so this is 15:00 local time -
    // squarely inside the 09:00-17:00 local window even though 20:00 is
    // well outside a naive 09:00-17:00 UTC comparison.
    const res = await request(app)
      .post("/api/portal/account/appointments")
      .set("Authorization", customerAuthHeader)
      .send({ title: "Inside local hours", start_time: "2026-01-15T20:00:00.000Z" });

    expect(res.status).toBe(201);

  });


  test("a request inside hours in UTC but outside hours in local time (New York) is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TzRejectLocal");

    const setRes = await updateBusiness(authHeader, "TzRejectLocal Business", { timezone: "America/New_York" });
    expect(setRes.status).toBe(200);

    const business = await getBusiness(authHeader);
    expect(business.timezone).toBe("America/New_York");

    await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "NY Customer 2", email: "tzrejectlocal@test.com" });

    const customerAuthHeader = await loginAsCustomer(business.slug, "tzrejectlocal@test.com");

    // 2026-01-15T10:00:00Z is a Thursday. At UTC-5 (EST) that's 05:00
    // local time - before the 09:00 local open, even though 10:00 falls
    // inside a naive 09:00-17:00 UTC comparison.
    const res = await request(app)
      .post("/api/portal/account/appointments")
      .set("Authorization", customerAuthHeader)
      .send({ title: "Outside local hours", start_time: "2026-01-15T10:00:00.000Z" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/09:00/);
    expect(res.body.error).toMatch(/17:00/);
    expect(res.body.error.toLowerCase()).toMatch(/thursday/);

  });


  test("an invalid timezone on the settings-update endpoint is rejected with 400", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TzInvalid");

    const res = await updateBusiness(authHeader, "TzInvalid Business", { timezone: "Not/A_Real_Zone" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/timezone/i);

    // The bad value must not have been persisted.
    const business = await getBusiness(authHeader);
    expect(business.timezone).toBeFalsy();

  });


  test("a valid IANA timezone is accepted and persisted", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TzValid");

    const res = await updateBusiness(authHeader, "TzValid Business", { timezone: "America/Los_Angeles" });
    expect(res.status).toBe(200);

    const business = await getBusiness(authHeader);
    expect(business.timezone).toBe("America/Los_Angeles");

  });

});
