const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");


// Server-wide (an env var, not anything per-business) - powers the
// "Email Sending" warning card in Settings, which only disappears once
// RESEND_FROM_EMAIL is actually configured. See docs/EMAIL_SETUP.md.
describe("GET /api/business/email-status", () => {

  afterEach(() => {
    delete process.env.RESEND_FROM_EMAIL;
  });


  test("real sending is reported as disabled when RESEND_FROM_EMAIL isn't set (the default test/dev state)", async () => {

    const { authHeader } = await createBusinessAndUser(app, "EmailStatusDisabled");

    delete process.env.RESEND_FROM_EMAIL;

    const res = await request(app)
      .get("/api/business/email-status")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body.real_sending_enabled).toBe(false);

  });


  test("real sending is reported as enabled once RESEND_FROM_EMAIL is configured", async () => {

    const { authHeader } = await createBusinessAndUser(app, "EmailStatusEnabled");

    process.env.RESEND_FROM_EMAIL = "Test Business <hello@example.com>";

    const res = await request(app)
      .get("/api/business/email-status")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body.real_sending_enabled).toBe(true);

  });


  test("requires authentication", async () => {

    const res = await request(app).get("/api/business/email-status");

    expect(res.status).toBe(401);

  });

});
