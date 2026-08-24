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

  test("a new password shorter than 6 characters is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PasswordChangeShort");

    const change = await request(app)
      .put("/api/auth/password")
      .set("Authorization", authHeader)
      .send({ currentPassword: "testpass123", newPassword: "123" });

    expect(change.status).toBe(400);

  });

});
