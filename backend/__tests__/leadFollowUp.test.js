const request = require("supertest");
const { v4: uuidv4 } = require("uuid");
const app = require("../server");
const db = require("../../database/db");
const { createBusinessAndUser } = require("./setup/helpers");
const { sendLeadFollowUps } = require("../services/leadFollowUpService");


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


// Inserted directly against the leads table rather than through the chat
// -> classifyLead auto-creation path, so each test has full control over
// status and next_follow_up without depending on the AI classifier mock.
const insertLead = ({
  business_id,
  customer_id,
  name,
  email,
  phone = null,
  interest = "Interested in a roof estimate",
  status = "new",
  next_follow_up = null
}) => {

  const id = uuidv4();

  return runAsync(

    `
    INSERT INTO leads
    (id, customer_id, business_id, name, email, phone, interest, status, next_follow_up)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,

    [id, customer_id, business_id, name, email, phone, interest, status, next_follow_up]

  ).then(() => id);

};


const daysAgoIso = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
const daysFromNowIso = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();


const getLeadRow = (id) => getAsync("SELECT * FROM leads WHERE id = ?", [id]);

const getNotificationsFor = (business_id) => allAsync(
  "SELECT * FROM notifications WHERE business_id = ? ORDER BY created_at DESC",
  [business_id]
);


describe("Automated lead follow-up", () => {

  beforeEach(() => {
    global.fetch.mockClear();
    // mockReset (not mockClear) so a `mockResolvedValueOnce` /
    // `mockRejectedValueOnce` a test queues but doesn't fully consume
    // can't survive into the next test; then re-establish the default.
    global.__mockOpenAICreate.mockReset();
    global.__mockOpenAICreate.mockResolvedValue({ output_text: "Hi there, just checking in on your project!" });
  });


  test("a lead with an overdue next_follow_up gets a drafted follow-up and a review notification", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "LeadFollowUpDue");
    const customerId = await createCustomer(authHeader, "Due Lead Customer", "leaddue@test.com");

    const leadId = await insertLead({
      business_id,
      customer_id: customerId,
      name: "Due Lead Customer",
      email: "leaddue@test.com",
      status: "contacted",
      next_follow_up: daysAgoIso(1)
    });

    const draftedCount = await sendLeadFollowUps();

    expect(draftedCount).toBeGreaterThanOrEqual(1);

    const notifications = await getNotificationsFor(business_id);
    expect(notifications.length).toBeGreaterThanOrEqual(1);
    expect(notifications[0].type).toBe("lead_follow_up_draft");
    expect(notifications[0].body).toContain("checking in");

    const row = await getLeadRow(leadId);
    expect(row.next_follow_up).toBeNull();

  });


  test("a lead whose next_follow_up is still in the future is left alone", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "LeadFollowUpFuture");
    const customerId = await createCustomer(authHeader, "Future Lead Customer", "leadfuture@test.com");

    const leadId = await insertLead({
      business_id,
      customer_id: customerId,
      name: "Future Lead Customer",
      email: "leadfuture@test.com",
      status: "contacted",
      next_follow_up: daysFromNowIso(2)
    });

    const draftedCount = await sendLeadFollowUps();

    expect(draftedCount).toBe(0);

    const notifications = await getNotificationsFor(business_id);
    expect(notifications).toHaveLength(0);

    const row = await getLeadRow(leadId);
    expect(row.next_follow_up).toBeTruthy();

  });


  test("a lead with no next_follow_up set is left alone", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "LeadFollowUpUnset");
    const customerId = await createCustomer(authHeader, "Unset Lead Customer", "leadunset@test.com");

    await insertLead({
      business_id,
      customer_id: customerId,
      name: "Unset Lead Customer",
      email: "leadunset@test.com",
      status: "new",
      next_follow_up: null
    });

    const draftedCount = await sendLeadFollowUps();

    expect(draftedCount).toBe(0);

    const notifications = await getNotificationsFor(business_id);
    expect(notifications).toHaveLength(0);

  });


  test.each(["new", "qualified"])(
    "a still-active lead (%s) with an overdue follow-up date is picked up",
    async (status) => {

      const { authHeader, business_id } = await createBusinessAndUser(app, `LeadFollowUpActive${status}`);
      const customerId = await createCustomer(authHeader, "Active Lead Customer", `leadactive-${status}@test.com`);

      await insertLead({
        business_id,
        customer_id: customerId,
        name: "Active Lead Customer",
        email: `leadactive-${status}@test.com`,
        status,
        next_follow_up: daysAgoIso(1)
      });

      const draftedCount = await sendLeadFollowUps();

      expect(draftedCount).toBeGreaterThanOrEqual(1);

    }
  );


  test("a closed lead with an overdue follow-up date is never followed up on", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "LeadFollowUpClosed");
    const customerId = await createCustomer(authHeader, "Closed Lead Customer", "leadclosed@test.com");

    const leadId = await insertLead({
      business_id,
      customer_id: customerId,
      name: "Closed Lead Customer",
      email: "leadclosed@test.com",
      status: "closed",
      next_follow_up: daysAgoIso(5)
    });

    const draftedCount = await sendLeadFollowUps();

    expect(draftedCount).toBe(0);

    const notifications = await getNotificationsFor(business_id);
    expect(notifications).toHaveLength(0);

    const row = await getLeadRow(leadId);
    expect(row.next_follow_up).toBeTruthy();

  });


  test("running again immediately does not re-draft the same lead", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "LeadFollowUpNoRepeat");
    const customerId = await createCustomer(authHeader, "Repeat Lead Customer", "leadrepeat@test.com");

    await insertLead({
      business_id,
      customer_id: customerId,
      name: "Repeat Lead Customer",
      email: "leadrepeat@test.com",
      status: "contacted",
      next_follow_up: daysAgoIso(1)
    });

    const firstRun = await sendLeadFollowUps();
    expect(firstRun).toBeGreaterThanOrEqual(1);

    const secondRun = await sendLeadFollowUps();
    expect(secondRun).toBe(0);

    const notifications = await getNotificationsFor(business_id);
    expect(notifications).toHaveLength(1);

  });


  test("a bad lead (AI drafting failure) does not block the rest of the batch", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "LeadFollowUpBadBatch");
    const customerA = await createCustomer(authHeader, "Bad Lead Customer", "leadbad@test.com");
    const customerB = await createCustomer(authHeader, "Good Lead Customer", "leadgood@test.com");

    await insertLead({
      business_id,
      customer_id: customerA,
      name: "Bad Lead Customer",
      email: "leadbad@test.com",
      status: "new",
      next_follow_up: daysAgoIso(2)
    });

    await insertLead({
      business_id,
      customer_id: customerB,
      name: "Good Lead Customer",
      email: "leadgood@test.com",
      status: "new",
      next_follow_up: daysAgoIso(1)
    });

    global.__mockOpenAICreate
      .mockRejectedValueOnce(new Error("AI service unavailable"))
      .mockResolvedValueOnce({ output_text: "Hi there, just checking in on your project!" });

    const draftedCount = await sendLeadFollowUps();

    expect(draftedCount).toBe(1);

    const notifications = await getNotificationsFor(business_id);
    expect(notifications).toHaveLength(1);

  });


  test("the AI-drafted follow-up is never auto-emailed to the lead - only a review notification is created", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "LeadFollowUpNoAutoSend");
    const customerId = await createCustomer(authHeader, "No Autosend Customer", "leadnoautosend@test.com");

    await insertLead({
      business_id,
      customer_id: customerId,
      name: "No Autosend Customer",
      email: "leadnoautosend@test.com",
      status: "contacted",
      next_follow_up: daysAgoIso(1)
    });

    await sendLeadFollowUps();

    // global.fetch is the only transport sendEmail() ever uses (see
    // emailService.js) - if the lead's address was ever the target of an
    // outbound email, it would show up here as a call whose body.to
    // includes it. It must not.
    const calledLeadEmail = global.fetch.mock.calls.some((call) => {

      const options = call[1] || {};

      if (!options.body) {
        return false;
      }

      try {

        const parsed = JSON.parse(options.body);
        return Array.isArray(parsed.to) && parsed.to.includes("leadnoautosend@test.com");

      } catch {

        return false;

      }

    });

    expect(calledLeadEmail).toBe(false);

    const notifications = await getNotificationsFor(business_id);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("lead_follow_up_draft");

  });

});
