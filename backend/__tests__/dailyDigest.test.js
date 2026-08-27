const request = require("supertest");
const { v4: uuidv4 } = require("uuid");
const app = require("../server");
const db = require("../../database/db");
const { createBusinessAndUser } = require("./setup/helpers");
const { sendDailyDigests } = require("../services/dailyDigestService");


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


const setTimezone = async (authHeader, businessName, timezone) => {

  return request(app)
    .put("/api/business")
    .set("Authorization", authHeader)
    .send({ name: businessName, timezone });

};


const getBusinessRow = (businessId) => {

  return getAsync(
    "SELECT last_digest_sent_date, timezone FROM businesses WHERE id = ?",
    [businessId]
  );

};


const createCustomer = async (authHeader, name, email) => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name, email });

  return res.body.id;

};


// leads has no dedicated POST route (leads are created internally by
// chatService via the AI classifier) - inserted directly here, the same
// way invoiceReminders.test.js backdates quotes directly rather than
// routing every fixture through the full customer-facing flow.
const insertLead = (business_id, customer_id, { name, email, priority = "warm", status = "new", createdAt } = {}) => {

  return runAsync(
    `
    INSERT INTO leads (id, customer_id, business_id, name, email, priority, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      uuidv4(),
      customer_id,
      business_id,
      name || null,
      email || null,
      priority,
      status,
      createdAt || new Date().toISOString()
    ]
  );

};


const createAppointment = async (authHeader, customerId, title, startTimeIso) => {

  const res = await request(app)
    .post("/api/appointments")
    .set("Authorization", authHeader)
    .send({ customer_id: customerId, title, start_time: startTimeIso });

  return res.body.id;

};


const createUnpaidInvoice = async (authHeader, customerId) => {

  const res = await request(app)
    .post("/api/quotes")
    .set("Authorization", authHeader)
    .send({
      customer_id: customerId,
      type: "invoice",
      items: [{ description: "Roof repair", quantity: 1, unit_price: 500 }]
    });

  await request(app)
    .patch(`/api/quotes/${res.body.id}`)
    .set("Authorization", authHeader)
    .send({ status: "sent" });

  return res.body.id;

};


const inviteStaff = async (authHeader, email) => {

  return request(app)
    .post("/api/auth/teammates")
    .set("Authorization", authHeader)
    .send({ name: "Staff Person", email, password: "testpass123", role: "staff" });

};


const recipientsFromSentEmails = () => {

  return global.fetch.mock.calls.map((call) => JSON.parse(call[1].body).to[0]);

};


describe("Daily digest emails", () => {

  beforeEach(() => {
    global.fetch.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });


  // 2026-01-15 is a Thursday. In January, America/New_York is UTC-5 (EST,
  // no DST) and America/Los_Angeles is UTC-8 (PST, no DST) - both fixed
  // offsets, matching the same date businessTimezone.test.js already uses
  // for deterministic non-DST math.
  const NY_LOCAL_8AM = "2026-01-15T13:00:00.000Z"; // 08:00 America/New_York
  const NY_LOCAL_2PM = "2026-01-15T19:00:00.000Z"; // 14:00 America/New_York


  test("a business at its local 8am with data to report gets the digest, and last_digest_sent_date is stamped", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "DigestDue");
    await setTimezone(authHeader, "DigestDue Business", "America/New_York");

    const customerId = await createCustomer(authHeader, "Due Customer", "due@test.com");
    await insertLead(business_id, customerId, { name: "Fresh Lead", email: "fresh@test.com" });

    jest.useFakeTimers().setSystemTime(new Date(NY_LOCAL_8AM));

    const sentCount = await sendDailyDigests();

    expect(sentCount).toBeGreaterThanOrEqual(1);
    expect(global.fetch).toHaveBeenCalled();

    const row = await getBusinessRow(business_id);
    expect(row.last_digest_sent_date).toBe("2026-01-15");

  });


  test("running the job again the same local day does not send a second email", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "DigestTwice");
    await setTimezone(authHeader, "DigestTwice Business", "America/New_York");

    const customerId = await createCustomer(authHeader, "Twice Customer", "twice@test.com");
    await insertLead(business_id, customerId, { name: "Twice Lead", email: "twicelead@test.com" });

    jest.useFakeTimers().setSystemTime(new Date(NY_LOCAL_8AM));

    await sendDailyDigests();
    global.fetch.mockClear();

    const secondRun = await sendDailyDigests();

    expect(secondRun).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();

  });


  test("a business outside its local target hour is left alone", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "DigestOutside");
    await setTimezone(authHeader, "DigestOutside Business", "America/New_York");

    const customerId = await createCustomer(authHeader, "Outside Customer", "outside@test.com");
    await insertLead(business_id, customerId, { name: "Outside Lead", email: "outsidelead@test.com" });

    jest.useFakeTimers().setSystemTime(new Date(NY_LOCAL_2PM));

    await sendDailyDigests();

    expect(global.fetch).not.toHaveBeenCalled();

    const row = await getBusinessRow(business_id);
    expect(row.last_digest_sent_date).toBeFalsy();

  });


  test("businesses in different timezones are evaluated independently", async () => {

    const ny = await createBusinessAndUser(app, "DigestTzNY");
    await setTimezone(ny.authHeader, "DigestTzNY Business", "America/New_York");
    const nyCustomer = await createCustomer(ny.authHeader, "NY Customer", "nycust@test.com");
    await insertLead(ny.business_id, nyCustomer, { name: "NY Lead", email: "nylead@test.com" });

    const la = await createBusinessAndUser(app, "DigestTzLA");
    await setTimezone(la.authHeader, "DigestTzLA Business", "America/Los_Angeles");
    const laCustomer = await createCustomer(la.authHeader, "LA Customer", "lacust@test.com");
    await insertLead(la.business_id, laCustomer, { name: "LA Lead", email: "lalead@test.com" });

    // At 13:00 UTC: America/New_York is 08:00 (target hour) while
    // America/Los_Angeles is 05:00 (not yet the target hour).
    jest.useFakeTimers().setSystemTime(new Date(NY_LOCAL_8AM));

    await sendDailyDigests();

    const nyRow = await getBusinessRow(ny.business_id);
    const laRow = await getBusinessRow(la.business_id);

    expect(nyRow.last_digest_sent_date).toBe("2026-01-15");
    expect(laRow.last_digest_sent_date).toBeFalsy();

    const recipients = recipientsFromSentEmails();
    expect(recipients).toContain("digesttzny@test.com");
    expect(recipients).not.toContain("lalead@test.com");

  });


  test("the digest content reflects real leads, today's appointments, and unpaid invoices", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "DigestContent");
    await setTimezone(authHeader, "DigestContent Business", "America/New_York");

    const customerId = await createCustomer(authHeader, "Content Customer", "contentcust@test.com");
    await insertLead(business_id, customerId, { name: "Content Lead", email: "contentlead@test.com" });

    // Same local calendar day as NY_LOCAL_8AM (2026-01-15 in
    // America/New_York) - 20:00 UTC is 15:00 local, still Jan 15th.
    await createAppointment(authHeader, customerId, "Chimney Inspection", "2026-01-15T20:00:00.000Z");

    await createUnpaidInvoice(authHeader, customerId);

    jest.useFakeTimers().setSystemTime(new Date(NY_LOCAL_8AM));

    await sendDailyDigests();

    expect(global.fetch).toHaveBeenCalled();

    const lastCall = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
    const body = JSON.parse(lastCall[1].body);

    expect(body.to).toEqual(["digestcontent@test.com"]);
    expect(body.subject).toContain("DigestContent Business");
    expect(body.html).toContain("Content Lead");
    expect(body.html).toContain("Chimney Inspection");
    expect(body.html).toMatch(/unpaid invoice/i);

  });


  // Regression test for a real HTML-injection vulnerability found during
  // review: a lead's name/an appointment's title are attacker-
  // controllable end to end via the public, unauthenticated chat widget
  // and portal appointment requests - this digest email is the one place
  // that data reaches a DIFFERENT person (the business owner) than the
  // customer who supplied it, unescaped, so a malicious name/title could
  // inject arbitrary HTML into the owner's inbox (CWE-79 stored XSS).
  test("a lead name or appointment title containing HTML is escaped, not injected raw", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "DigestXssGuard");
    await setTimezone(authHeader, "DigestXssGuard Business", "America/New_York");

    const customerId = await createCustomer(authHeader, "XSS Customer", "xsscust@test.com");

    await insertLead(business_id, customerId, {
      name: '<img src=x onerror="alert(1)">',
      email: "xsslead@test.com",
      priority: "hot"
    });

    await createAppointment(
      authHeader,
      customerId,
      '<script>alert(document.cookie)</script>',
      "2026-01-15T20:00:00.000Z"
    );

    jest.useFakeTimers().setSystemTime(new Date(NY_LOCAL_8AM));

    await sendDailyDigests();

    const lastCall = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
    const body = JSON.parse(lastCall[1].body);

    expect(body.html).not.toContain("<img src=x onerror=");
    expect(body.html).not.toContain("<script>alert(document.cookie)</script>");
    expect(body.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(body.html).toContain("&lt;script&gt;alert(document.cookie)&lt;/script&gt;");

  });


  test("only owners receive the digest, not staff", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "DigestRoles");
    await setTimezone(authHeader, "DigestRoles Business", "America/New_York");

    const inviteRes = await inviteStaff(authHeader, "digestrolesstaff@test.com");
    expect(inviteRes.status).toBe(201);

    const customerId = await createCustomer(authHeader, "Roles Customer", "rolescust@test.com");
    await insertLead(business_id, customerId, { name: "Roles Lead", email: "roleslead@test.com" });

    jest.useFakeTimers().setSystemTime(new Date(NY_LOCAL_8AM));

    await sendDailyDigests();

    const recipients = recipientsFromSentEmails();

    expect(recipients).toContain("digestroles@test.com");
    expect(recipients).not.toContain("digestrolesstaff@test.com");

  });

});
