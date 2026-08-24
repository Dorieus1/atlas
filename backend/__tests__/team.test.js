const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");

describe("Team logins", () => {

  test("registering against a business that already has a user is rejected", async () => {

    const { business_id } = await createBusinessAndUser(app, "TeamSecurity");

    const attempt = await request(app)
      .post("/api/auth/register")
      .send({
        business_id,
        name: "Intruder",
        email: "intruder@test.com",
        password: "testpass123"
      });

    expect(attempt.status).toBe(403);

  });

  test("an authenticated user can invite a teammate, who can then log in and see the same business's data", async () => {

    const owner = await createBusinessAndUser(app, "TeamInvite");

    const invite = await request(app)
      .post("/api/auth/teammates")
      .set("Authorization", owner.authHeader)
      .send({
        name: "Teammate One",
        email: "teammate-invite@test.com",
        password: "teammatepass123"
      });

    expect(invite.status).toBe(201);

    const teammateLogin = await request(app)
      .post("/api/auth/login")
      .send({
        email: "teammate-invite@test.com",
        password: "teammatepass123"
      });

    expect(teammateLogin.status).toBe(200);
    expect(teammateLogin.body.user.business_id).toBe(owner.business_id);

    const created = await request(app)
      .post("/api/customers")
      .set("Authorization", owner.authHeader)
      .send({ name: "Shared Customer" });

    const asTeammate = await request(app)
      .get("/api/customers")
      .set("Authorization", `Bearer ${teammateLogin.body.token}`);

    expect(asTeammate.body.map((c) => c.id)).toContain(created.body.id);

  });

  test("inviting rejects blank fields, short passwords, and duplicate emails", async () => {

    const owner = await createBusinessAndUser(app, "TeamValidation");

    const blank = await request(app)
      .post("/api/auth/teammates")
      .set("Authorization", owner.authHeader)
      .send({ name: "  ", email: "", password: "" });

    expect(blank.status).toBe(400);

    const shortPassword = await request(app)
      .post("/api/auth/teammates")
      .set("Authorization", owner.authHeader)
      .send({ name: "Teammate", email: "short-pw@test.com", password: "123" });

    expect(shortPassword.status).toBe(400);

    await request(app)
      .post("/api/auth/teammates")
      .set("Authorization", owner.authHeader)
      .send({ name: "Teammate", email: "dupe@test.com", password: "validpass123" });

    const dupe = await request(app)
      .post("/api/auth/teammates")
      .set("Authorization", owner.authHeader)
      .send({ name: "Teammate Two", email: "dupe@test.com", password: "validpass123" });

    expect(dupe.status).toBe(409);

  });

  test("you can't remove your own login", async () => {

    const owner = await createBusinessAndUser(app, "TeamSelfRemove");

    const selfRemove = await request(app)
      .delete(`/api/auth/teammates/${owner.userId}`)
      .set("Authorization", owner.authHeader);

    expect(selfRemove.status).toBe(400);

  });

  test("removing a teammate works, and one business can't remove another business's login", async () => {

    const owner = await createBusinessAndUser(app, "TeamRemove");
    const otherBiz = await createBusinessAndUser(app, "TeamRemoveOther");

    const invite = await request(app)
      .post("/api/auth/teammates")
      .set("Authorization", owner.authHeader)
      .send({
        name: "Removable Teammate",
        email: "removable@test.com",
        password: "removablepass123"
      });

    const teammateId = invite.body.id;

    const crossAttempt = await request(app)
      .delete(`/api/auth/teammates/${teammateId}`)
      .set("Authorization", otherBiz.authHeader);

    expect(crossAttempt.status).toBe(404);

    const list = await request(app)
      .get("/api/auth/teammates")
      .set("Authorization", owner.authHeader);

    expect(list.body).toHaveLength(2);

    const remove = await request(app)
      .delete(`/api/auth/teammates/${teammateId}`)
      .set("Authorization", owner.authHeader);

    expect(remove.status).toBe(200);

    const afterRemove = await request(app)
      .get("/api/auth/teammates")
      .set("Authorization", owner.authHeader);

    expect(afterRemove.body).toHaveLength(1);

  });

});
