const request = require("supertest");
const { v4: uuidv4 } = require("uuid");
const app = require("../server");
const db = require("../../database/db");
const { createBusinessAndUser } = require("./setup/helpers");
const { sendWinBackCampaign } = require("../services/winBackService");


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


const createCustomer = async (authHeader, name, email) => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name, email });

  return res.body.id;

};


const daysAgoIso = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();


// Inserted directly against the appointments table (same reasoning as
// leadFollowUp.test.js inserting leads directly) so a test can set an
// arbitrary historical start_time without depending on the create route's
// own business-hours/future-date assumptions, which have nothing to do
// with what this job is testing.
const insertAppointment = (business_id, customer_id, startTimeIso) => {

  return runAsync(

    `
    INSERT INTO appointments (id, business_id, customer_id, title, start_time, status)
    VALUES (?, ?, ?, ?, ?, 'completed')
    `,

    [uuidv4(), business_id, customer_id, "Roof inspection", startTimeIso]

  );

};


const getCustomerRow = (id) => getAsync("SELECT * FROM customers WHERE id = ?", [id]);

const getNotificationsFor = (business_id) => allAsync(
  "SELECT * FROM notifications WHERE business_id = ? ORDER BY created_at DESC",
  [business_id]
);


describe("Customer win-back campaign", () => {

  beforeEach(() => {
    global.__mockOpenAICreate.mockClear();
    global.__mockOpenAICreate.mockResolvedValue({ output_text: "Hi! It's been a while - would love to have you back." });
  });


  test("a past customer with no activity in 90+ days gets a win-back draft, and last_win_back_at is stamped", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "WinBackDormant");
    const customerId = await createCustomer(authHeader, "Dormant Customer", "dormant@test.com");

    await insertAppointment(business_id, customerId, daysAgoIso(120));

    await sendWinBackCampaign();

    const notifications = await getNotificationsFor(business_id);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("customer_win_back_draft");
    expect(notifications[0].link).toBe(`/customers/${customerId}`);
    expect(notifications[0].body).toContain("been a while");

    const row = await getCustomerRow(customerId);
    expect(row.last_win_back_at).toBeTruthy();

  });


  test("a customer with a recent appointment is left alone", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "WinBackRecent");
    const customerId = await createCustomer(authHeader, "Recent Customer", "recent@test.com");

    await insertAppointment(business_id, customerId, daysAgoIso(10));

    await sendWinBackCampaign();

    const notifications = await getNotificationsFor(business_id);
    expect(notifications).toHaveLength(0);

    const row = await getCustomerRow(customerId);
    expect(row.last_win_back_at).toBeNull();

  });


  test("a lead with no appointment or quote ever is never treated as dormant - that's leadFollowUpService's job, not this one", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "WinBackNoHistory");
    await createCustomer(authHeader, "No History Customer", "nohistory@test.com");

    await sendWinBackCampaign();

    const notifications = await getNotificationsFor(business_id);
    expect(notifications).toHaveLength(0);

  });


  test("a customer already drafted recently isn't drafted again until the cooldown passes", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "WinBackCooldown");
    const customerId = await createCustomer(authHeader, "Cooldown Customer", "cooldown@test.com");

    await insertAppointment(business_id, customerId, daysAgoIso(200));

    await runAsync(
      "UPDATE customers SET last_win_back_at = ? WHERE id = ?",
      [daysAgoIso(10), customerId]
    );

    await sendWinBackCampaign();

    const notifications = await getNotificationsFor(business_id);
    expect(notifications).toHaveLength(0);

  });


  test("a customer whose old win-back has passed its cooldown gets drafted again", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "WinBackReDraft");
    const customerId = await createCustomer(authHeader, "Re-Draft Customer", "redraft@test.com");

    await insertAppointment(business_id, customerId, daysAgoIso(400));

    await runAsync(
      "UPDATE customers SET last_win_back_at = ? WHERE id = ?",
      [daysAgoIso(100), customerId]
    );

    await sendWinBackCampaign();

    const notifications = await getNotificationsFor(business_id);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("customer_win_back_draft");

  });


  test("a soft-deleted (trashed) customer is never drafted", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "WinBackTrashed");
    const customerId = await createCustomer(authHeader, "Trashed Customer", "trashed@test.com");

    await insertAppointment(business_id, customerId, daysAgoIso(150));

    await request(app)
      .delete(`/api/customers/${customerId}`)
      .set("Authorization", authHeader);

    await sendWinBackCampaign();

    const notifications = await getNotificationsFor(business_id);
    expect(notifications).toHaveLength(0);

  });

});
