const request = require("supertest");
const app = require("../server");
const db = require("../../database/db");
const { createBusinessAndUser } = require("./setup/helpers");

describe("Auth: register and login", () => {

  test("a full signup can register and then log in", async () => {

    const biz = await request(app)
      .post("/api/business")
      .send({ name: "Auth Test Co" });

    expect(biz.status).toBe(201);

    const register = await request(app)
      .post("/api/auth/register")
      .send({
        business_id: biz.body.id,
        name: "Owner",
        email: "authtest@test.com",
        password: "testpass123"
      });

    expect(register.status).toBe(200);

    const login = await request(app)
      .post("/api/auth/login")
      .send({
        email: "authtest@test.com",
        password: "testpass123"
      });

    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
    expect(login.body.user.business_id).toBe(biz.body.id);

  });

  test("a whitespace-only business name is rejected, and a padded one gets trimmed", async () => {

    const blank = await request(app)
      .post("/api/business")
      .send({ name: "   " });

    expect(blank.status).toBe(400);

    const padded = await request(app)
      .post("/api/business")
      .send({ name: "  Padded Business Co  " });

    expect(padded.status).toBe(201);

    const rows = await new Promise((resolve, reject) => {
      db.all(
        "SELECT name FROM businesses WHERE id = ?",
        [padded.body.id],
        (err, r) => err ? reject(err) : resolve(r)
      );
    });

    expect(rows[0].name).toBe("Padded Business Co");

  });

  test("a whitespace-only owner name gets trimmed on signup", async () => {

    const biz = await request(app)
      .post("/api/business")
      .send({ name: "Trim Owner Co" });

    await request(app)
      .post("/api/auth/register")
      .send({
        business_id: biz.body.id,
        name: "  Padded Owner  ",
        email: "trimowner@test.com",
        password: "testpass123"
      });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "trimowner@test.com", password: "testpass123" });

    expect(login.body.user.name).toBe("Padded Owner");

  });

  test("login is case-insensitive and trims whitespace on the email", async () => {

    const biz = await request(app)
      .post("/api/business")
      .send({ name: "Case Test Co" });

    await request(app)
      .post("/api/auth/register")
      .send({
        business_id: biz.body.id,
        name: "Owner",
        email: "CaseSensitive@Test.com",
        password: "testpass123"
      });

    const lowercase = await request(app)
      .post("/api/auth/login")
      .send({
        email: "casesensitive@test.com",
        password: "testpass123"
      });

    expect(lowercase.status).toBe(200);

    const padded = await request(app)
      .post("/api/auth/login")
      .send({
        email: "  CaseSensitive@Test.com  ",
        password: "testpass123"
      });

    expect(padded.status).toBe(200);

  });

  test("wrong password is rejected", async () => {

    const biz = await request(app)
      .post("/api/business")
      .send({ name: "Wrong Pass Co" });

    await request(app)
      .post("/api/auth/register")
      .send({
        business_id: biz.body.id,
        name: "Owner",
        email: "wrongpass@test.com",
        password: "correctpass123"
      });

    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: "wrongpass@test.com",
        password: "incorrectpass123"
      });

    expect(res.status).toBe(401);

  });

  test("login with an unregistered email returns 404", async () => {

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "someone@test.com" });

    expect(res.status).toBe(404);

  });

  test("registering a duplicate email is rejected with 409, even under a different business", async () => {

    const bizA = await request(app)
      .post("/api/business")
      .send({ name: "Duplicate Email Co A" });

    const first = await request(app)
      .post("/api/auth/register")
      .send({
        business_id: bizA.body.id,
        name: "First",
        email: "duplicate@test.com",
        password: "testpass123"
      });

    expect(first.status).toBe(200);

    const bizB = await request(app)
      .post("/api/business")
      .send({ name: "Duplicate Email Co B" });

    const second = await request(app)
      .post("/api/auth/register")
      .send({
        business_id: bizB.body.id,
        name: "Second",
        email: "duplicate@test.com",
        password: "anotherpass123"
      });

    expect(second.status).toBe(409);

  });

  test("registering a second account against a business that already has one is rejected", async () => {

    const biz = await request(app)
      .post("/api/business")
      .send({ name: "Already Claimed Co" });

    await request(app)
      .post("/api/auth/register")
      .send({
        business_id: biz.body.id,
        name: "First",
        email: "already-claimed@test.com",
        password: "testpass123"
      });

    const second = await request(app)
      .post("/api/auth/register")
      .send({
        business_id: biz.body.id,
        name: "Second",
        email: "different-email@test.com",
        password: "anotherpass123"
      });

    expect(second.status).toBe(403);

  });

});



describe("Auth: forgot password / reset password", () => {

  let email;

  beforeAll(async () => {

    const biz = await request(app)
      .post("/api/business")
      .send({ name: "Reset Flow Co" });

    email = "resetflow@test.com";

    await request(app)
      .post("/api/auth/register")
      .send({
        business_id: biz.body.id,
        name: "Owner",
        email,
        password: "originalpass123"
      });

  });

  test("forgot-password always returns a generic message, whether or not the email exists", async () => {

    const known = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email });

    const unknown = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "doesnotexist@test.com" });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);

  });

  test("a valid reset token lets you set a new password, and the old password stops working", async () => {

    const row = await new Promise((resolve, reject) => {
      db.get(
        "SELECT reset_token FROM users WHERE email = ?",
        [email],
        (err, row) => (err ? reject(err) : resolve(row))
      );
    });

    const token = row.reset_token;

    expect(token).toBeTruthy();

    const reset = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "brandNewPassword123" });

    expect(reset.status).toBe(200);

    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "originalpass123" });

    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "brandNewPassword123" });

    expect(newLogin.status).toBe(200);

    const reuse = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "someOtherPassword123" });

    expect(reuse.status).toBe(400);

  });

  test("an invalid token is rejected", async () => {

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "not-a-real-token", password: "somepassword123" });

    expect(res.status).toBe(400);

  });

  test("a too-short password is rejected", async () => {

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "anything", password: "abc" });

    expect(res.status).toBe(400);

  });

  test("a business with zero logins can be cleaned up (the leftover-from-a-failed-signup case)", async () => {

    const biz = await request(app)
      .post("/api/business")
      .send({ name: "Orphaned By Failed Signup" });

    const del = await request(app)
      .delete(`/api/business/${biz.body.id}/incomplete`);

    expect(del.status).toBe(200);

    const rows = await new Promise((resolve, reject) => {
      db.all(
        "SELECT id FROM businesses WHERE id = ?",
        [biz.body.id],
        (err, r) => err ? reject(err) : resolve(r)
      );
    });

    expect(rows).toHaveLength(0);

  });

  test("a business that already has a real account can't be removed this way", async () => {

    const { business_id } = await createBusinessAndUser(app, "NotOrphaned");

    const del = await request(app)
      .delete(`/api/business/${business_id}/incomplete`);

    expect(del.status).toBe(400);

    const rows = await new Promise((resolve, reject) => {
      db.all(
        "SELECT id FROM businesses WHERE id = ?",
        [business_id],
        (err, r) => err ? reject(err) : resolve(r)
      );
    });

    expect(rows).toHaveLength(1);

  });

  test("failing to sign up (duplicate email) doesn't leave the business behind permanently", async () => {

    const first = await createBusinessAndUser(app, "SimulatedFailedSignup");

    const secondBiz = await request(app)
      .post("/api/business")
      .send({ name: "Second Attempt Business" });

    const failedRegister = await request(app)
      .post("/api/auth/register")
      .send({
        business_id: secondBiz.body.id,
        name: "Second Owner",
        email: "simulatedfailedsignup@test.com",
        password: "testpass123"
      });

    expect(failedRegister.status).toBe(409);

    // This is the cleanup Onboarding.jsx performs when registration fails
    await request(app)
      .delete(`/api/business/${secondBiz.body.id}/incomplete`);

    const rows = await new Promise((resolve, reject) => {
      db.all(
        "SELECT id FROM businesses WHERE id = ?",
        [secondBiz.body.id],
        (err, r) => err ? reject(err) : resolve(r)
      );
    });

    expect(rows).toHaveLength(0);

  });

});
