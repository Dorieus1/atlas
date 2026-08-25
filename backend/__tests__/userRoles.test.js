const request = require("supertest");
const app = require("../server");
const db = require("../../database/db");
const { createBusinessAndUser } = require("./setup/helpers");

// Invites a teammate (optionally with an explicit role) and logs them in,
// returning the same shape as createBusinessAndUser so tests can treat an
// owner and a staff member interchangeably.
const inviteAndLogin = async (owner, prefix, role) => {

  const email = `${prefix.toLowerCase()}@test.com`;
  const password = "teammatepass123";

  const invite = await request(app)
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
    inviteStatus: invite.status,
    inviteBody: invite.body,
    business_id: owner.business_id,
    token: login.body.token,
    authHeader: `Bearer ${login.body.token}`,
    userId: login.body.user.id
  };

};

describe("User roles: owner vs staff", () => {

  test("the first user created for a business (via register) is an owner", async () => {

    const owner = await createBusinessAndUser(app, "RoleFirstUser");

    const row = await new Promise((resolve, reject) => {
      db.get(
        "SELECT role FROM users WHERE id = ?",
        [owner.userId],
        (err, r) => (err ? reject(err) : resolve(r))
      );
    });

    expect(row.role).toBe("owner");

  });

  test("inviting a teammate with no role specified defaults to staff", async () => {

    const owner = await createBusinessAndUser(app, "RoleDefaultStaff");

    const teammate = await inviteAndLogin(owner, "RoleDefaultStaffMate");

    expect(teammate.inviteStatus).toBe(201);

    const row = await new Promise((resolve, reject) => {
      db.get(
        "SELECT role FROM users WHERE id = ?",
        [teammate.inviteBody.id],
        (err, r) => (err ? reject(err) : resolve(r))
      );
    });

    expect(row.role).toBe("staff");

  });

  test("an owner can explicitly invite another owner", async () => {

    const owner = await createBusinessAndUser(app, "RoleExplicitOwner");

    const teammate = await inviteAndLogin(owner, "RoleExplicitOwnerMate", "owner");

    expect(teammate.inviteStatus).toBe(201);

    const row = await new Promise((resolve, reject) => {
      db.get(
        "SELECT role FROM users WHERE id = ?",
        [teammate.inviteBody.id],
        (err, r) => (err ? reject(err) : resolve(r))
      );
    });

    expect(row.role).toBe("owner");

  });

  test("an invalid role value on invite is rejected", async () => {

    const owner = await createBusinessAndUser(app, "RoleInvalid");

    const attempt = await request(app)
      .post("/api/auth/teammates")
      .set("Authorization", owner.authHeader)
      .send({
        name: "Bad Role",
        email: "badrole@test.com",
        password: "badrolepass123",
        role: "superadmin"
      });

    expect(attempt.status).toBe(400);

  });

  test("a staff member gets 403 on invite-teammate, remove-teammate, Stripe-connect-start, and update-business", async () => {

    const owner = await createBusinessAndUser(app, "RoleGateOwner");
    const staff = await inviteAndLogin(owner, "RoleGateStaff", "staff");

    const invite = await request(app)
      .post("/api/auth/teammates")
      .set("Authorization", staff.authHeader)
      .send({
        name: "Should Not Work",
        email: "shouldnotwork@test.com",
        password: "shouldnotwork123"
      });

    expect(invite.status).toBe(403);
    expect(invite.body.error).toMatch(/owner/i);

    const remove = await request(app)
      .delete(`/api/auth/teammates/${owner.userId}`)
      .set("Authorization", staff.authHeader);

    expect(remove.status).toBe(403);
    expect(remove.body.error).toMatch(/owner/i);

    const stripeStart = await request(app)
      .post("/api/stripe/connect/start")
      .set("Authorization", staff.authHeader);

    expect(stripeStart.status).toBe(403);
    expect(stripeStart.body.error).toMatch(/owner/i);

    const updateBusiness = await request(app)
      .put("/api/business")
      .set("Authorization", staff.authHeader)
      .send({ name: "Renamed By Staff" });

    expect(updateBusiness.status).toBe(403);
    expect(updateBusiness.body.error).toMatch(/owner/i);

  });

  test("an owner can perform all four owner-only actions normally", async () => {

    const owner = await createBusinessAndUser(app, "RoleOwnerAllowed");

    const invite = await request(app)
      .post("/api/auth/teammates")
      .set("Authorization", owner.authHeader)
      .send({
        name: "New Teammate",
        email: "roleownerallowed-mate@test.com",
        password: "newteammate123"
      });

    expect(invite.status).toBe(201);

    const stripeStart = await request(app)
      .post("/api/stripe/connect/start")
      .set("Authorization", owner.authHeader);

    expect(stripeStart.status).toBe(200);

    const updateBusiness = await request(app)
      .put("/api/business")
      .set("Authorization", owner.authHeader)
      .send({ name: "Renamed By Owner" });

    expect(updateBusiness.status).toBe(200);

    const remove = await request(app)
      .delete(`/api/auth/teammates/${invite.body.id}`)
      .set("Authorization", owner.authHeader);

    expect(remove.status).toBe(200);

  });

  test("a staff member can still do ordinary CRM work and change their own password, unaffected", async () => {

    const owner = await createBusinessAndUser(app, "RoleStaffOrdinary");
    const staff = await inviteAndLogin(owner, "RoleStaffOrdinaryMate", "staff");

    const customer = await request(app)
      .post("/api/customers")
      .set("Authorization", staff.authHeader)
      .send({ name: "Staff Made Customer" });

    expect(customer.status).toBeLessThan(300);

    const appointment = await request(app)
      .post("/api/appointments")
      .set("Authorization", staff.authHeader)
      .send({
        title: "Staff Made Appointment",
        start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      });

    expect(appointment.status).toBe(201);

    const changePassword = await request(app)
      .put("/api/auth/password")
      .set("Authorization", staff.authHeader)
      .send({
        currentPassword: "teammatepass123",
        newPassword: "brandNewStaffPass123"
      });

    expect(changePassword.status).toBe(200);

  });

  test("role is read fresh from the DB on every request, not cached on the token - a role change takes effect on the very next request", async () => {

    const owner = await createBusinessAndUser(app, "RoleFreshLookup");
    const staff = await inviteAndLogin(owner, "RoleFreshLookupMate", "staff");

    const before = await request(app)
      .post("/api/stripe/connect/start")
      .set("Authorization", staff.authHeader);

    expect(before.status).toBe(403);

    // Promote the same user directly in the DB, without issuing a new
    // token - this simulates a role change taking effect without the
    // user logging out/in again.
    await new Promise((resolve, reject) => {
      db.run(
        "UPDATE users SET role = 'owner' WHERE id = ?",
        [staff.userId],
        (err) => (err ? reject(err) : resolve())
      );
    });

    const after = await request(app)
      .post("/api/stripe/connect/start")
      .set("Authorization", staff.authHeader);

    expect(after.status).toBe(200);

  });

});
