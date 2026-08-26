const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");

describe("Change password", () => {

  test("changing your password with the correct current password works, and you can log in with the new one", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PasswordChange");

    const change = await request(app)
      .put("/api/auth/password")
      .set("Authorization", authHeader)
      .send({ currentPassword: "testpass123", newPassword: "brandnewpass456" });

    expect(change.status).toBe(200);

    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "passwordchange@test.com", password: "testpass123" });

    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "passwordchange@test.com", password: "brandnewpass456" });

    expect(newLogin.status).toBe(200);

  });

  test("changing your password with the wrong current password is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PasswordChangeWrong");

    const change = await request(app)
      .put("/api/auth/password")
      .set("Authorization", authHeader)
      .send({ currentPassword: "wrongpassword", newPassword: "brandnewpass456" });

    expect(change.status).toBe(401);

    const stillOldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "passwordchangewrong@test.com", password: "testpass123" });

    expect(stillOldLogin.status).toBe(200);

  });

  test("changing your password invalidates every token issued before the change - a leaked token stops working immediately", async () => {

    const jwt = require("jsonwebtoken");
    const { business_id, userId } = await createBusinessAndUser(app, "PasswordChangeRevoke");

    // Deliberately minted with an `iat` a few seconds in the past rather
    // than relying on real wall-clock delay between this and the
    // password change below - jwt.sign uses an `iat` already present in
    // the payload instead of generating a fresh one. authMiddleware's
    // invalidation check only has whole-second resolution to work with
    // (see its comment), so without this, a fast test run risks both
    // this token and the password change landing in the very same
    // second, making "was this token issued before or after the change"
    // genuinely ambiguous - a real, if narrow, limitation of comparing
    // against `iat`, not something worth chasing further here.
    const oldToken = jwt.sign(
      { id: userId, business_id, iat: Math.floor(Date.now() / 1000) - 10 },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    const oldAuthHeader = `Bearer ${oldToken}`;

    const beforeChange = await request(app)
      .get("/api/business")
      .set("Authorization", oldAuthHeader);

    expect(beforeChange.status).toBe(200);

    await request(app)
      .put("/api/auth/password")
      .set("Authorization", oldAuthHeader)
      .send({ currentPassword: "testpass123", newPassword: "brandnewpass456" });

    // The OLD token (the one that was current right up until the change
    // above) must stop working immediately, not stay valid for the rest
    // of its normal 7-day life - this is exactly the scenario a stolen/
    // leaked token relies on if the real owner doesn't know to log out
    // everywhere, since there's no such thing as "log out everywhere".
    const afterChange = await request(app)
      .get("/api/business")
      .set("Authorization", oldAuthHeader);

    expect(afterChange.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "passwordchangerevoke@test.com", password: "brandnewpass456" });

    expect(newLogin.status).toBe(200);

    const freshAuthHeader = `Bearer ${newLogin.body.token}`;

    const withFreshToken = await request(app)
      .get("/api/business")
      .set("Authorization", freshAuthHeader);

    expect(withFreshToken.status).toBe(200);

  });

  test("a new password shorter than 6 characters is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PasswordChangeShort");

    const change = await request(app)
      .put("/api/auth/password")
      .set("Authorization", authHeader)
      .send({ currentPassword: "testpass123", newPassword: "123" });

    expect(change.status).toBe(400);

  });

});
