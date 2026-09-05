const request = require("supertest");
const app = require("../server");
const db = require("../../database/db");
const { createBusinessAndUser } = require("./setup/helpers");
const { sendInvoiceReminders } = require("../services/invoiceReminderService");


const createCustomer = async (authHeader, name, email) => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name, email });

  return res.body.id;

};


const createInvoice = async (authHeader, customerId) => {

  const res = await request(app)
    .post("/api/quotes")
    .set("Authorization", authHeader)
    .send({
      customer_id: customerId,
      type: "invoice",
      items: [{ description: "Roof repair", quantity: 1, unit_price: 500 }]
    });

  return res.body.id;

};


const setStatus = async (authHeader, invoiceId, status) => {

  await request(app)
    .patch(`/api/quotes/${invoiceId}`)
    .set("Authorization", authHeader)
    .send({ status });

};


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


// Backdates sent_at (and optionally last_reminder_sent_at) directly, since
// the controller always stamps "now" and the reminder job cares about age.
const backdateInvoice = (invoiceId, { sentDaysAgo, reminderDaysAgo, reminderCount } = {}) => {

  const clauses = [];
  const values = [];

  if (sentDaysAgo !== undefined) {
    clauses.push("sent_at = ?");
    values.push(new Date(Date.now() - sentDaysAgo * 24 * 60 * 60 * 1000).toISOString());
  }

  if (reminderDaysAgo !== undefined) {
    clauses.push("last_reminder_sent_at = ?");
    values.push(new Date(Date.now() - reminderDaysAgo * 24 * 60 * 60 * 1000).toISOString());
  }

  if (reminderCount !== undefined) {
    clauses.push("reminder_count = ?");
    values.push(reminderCount);
  }

  values.push(invoiceId);

  return runAsync(`UPDATE quotes SET ${clauses.join(", ")} WHERE id = ?`, values);

};


const getQuoteRow = (invoiceId) => {

  return getAsync(
    "SELECT status, sent_at, last_reminder_sent_at, reminder_count FROM quotes WHERE id = ?",
    [invoiceId]
  );

};


describe("Invoice payment reminder emails", () => {

  beforeEach(() => {
    global.fetch.mockClear();
  });


  test("marking an invoice sent stamps sent_at", async () => {

    const { authHeader } = await createBusinessAndUser(app, "SentStamp");
    const customerId = await createCustomer(authHeader, "Stamp Customer", "stamp@test.com");
    const invoiceId = await createInvoice(authHeader, customerId);

    await setStatus(authHeader, invoiceId, "sent");

    const row = await getQuoteRow(invoiceId);
    expect(row.sent_at).toBeTruthy();

  });


  test("a sent invoice 4+ days old with a customer email gets a reminder", async () => {

    const { authHeader } = await createBusinessAndUser(app, "InvoiceReminderDue");
    const customerId = await createCustomer(authHeader, "Due Customer", "due@test.com");
    const invoiceId = await createInvoice(authHeader, customerId);

    await setStatus(authHeader, invoiceId, "sent");
    await backdateInvoice(invoiceId, { sentDaysAgo: 4 });

    const sentCount = await sendInvoiceReminders();

    expect(sentCount).toBeGreaterThanOrEqual(1);
    expect(global.fetch).toHaveBeenCalled();

    const row = await getQuoteRow(invoiceId);
    expect(row.last_reminder_sent_at).toBeTruthy();
    expect(row.reminder_count).toBe(1);

  });


  test("the first reminder also creates an in-app notification for the owner", async () => {

    const { authHeader } = await createBusinessAndUser(app, "InvoiceReminderNotifies");
    const customerId = await createCustomer(authHeader, "Notify Customer", "notify@test.com");
    const invoiceId = await createInvoice(authHeader, customerId);

    await setStatus(authHeader, invoiceId, "sent");
    await backdateInvoice(invoiceId, { sentDaysAgo: 4 });

    await sendInvoiceReminders();

    const notifications = await request(app)
      .get("/api/notifications")
      .set("Authorization", authHeader);

    const overdueNotification = notifications.body.find((n) => n.type === "invoice_overdue");

    expect(overdueNotification).toBeTruthy();
    expect(overdueNotification.title).toContain("Notify Customer");
    expect(overdueNotification.link).toBe("/quotes");

  });


  test("a second reminder on the same invoice doesn't create a duplicate notification", async () => {

    const { authHeader } = await createBusinessAndUser(app, "InvoiceReminderNoDupe");
    const customerId = await createCustomer(authHeader, "Dupe Customer", "dupe@test.com");
    const invoiceId = await createInvoice(authHeader, customerId);

    await setStatus(authHeader, invoiceId, "sent");
    await backdateInvoice(invoiceId, { sentDaysAgo: 4 });

    await sendInvoiceReminders();

    await backdateInvoice(invoiceId, { sentDaysAgo: 9, reminderDaysAgo: 6 });

    await sendInvoiceReminders();

    const row = await getQuoteRow(invoiceId);
    expect(row.reminder_count).toBe(2);

    const notifications = await request(app)
      .get("/api/notifications")
      .set("Authorization", authHeader);

    const overdueNotifications = notifications.body.filter((n) => n.type === "invoice_overdue");

    expect(overdueNotifications.length).toBe(1);

  });


  test("a freshly-sent invoice (under 3 days old) is left alone", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ReminderFresh");
    const customerId = await createCustomer(authHeader, "Fresh Customer", "fresh@test.com");
    const invoiceId = await createInvoice(authHeader, customerId);

    await setStatus(authHeader, invoiceId, "sent");

    await sendInvoiceReminders();

    const row = await getQuoteRow(invoiceId);
    expect(row.last_reminder_sent_at).toBeFalsy();
    expect(row.reminder_count).toBe(0);

  });


  test.each(["draft", "accepted", "declined", "paid"])(
    "a %s invoice is never reminded even if old",
    async (status) => {

      const { authHeader } = await createBusinessAndUser(app, `Reminder${status}`);
      const customerId = await createCustomer(authHeader, "Status Customer", `status-${status}@test.com`);
      const invoiceId = await createInvoice(authHeader, customerId);

      // Route through "sent" first so sent_at gets stamped, then move on -
      // this exercises the real path an invoice would take to reach any
      // of these statuses while still letting us backdate sent_at.
      await setStatus(authHeader, invoiceId, "sent");
      await backdateInvoice(invoiceId, { sentDaysAgo: 10 });

      if (status !== "sent") {

        if (status === "paid") {
          await setStatus(authHeader, invoiceId, "paid");
        } else {
          await setStatus(authHeader, invoiceId, status);
        }

      }

      await sendInvoiceReminders();

      const row = await getQuoteRow(invoiceId);
      expect(row.reminder_count).toBe(0);

    }
  );


  test("an invoice already at reminder_count 3 is never reminded again", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ReminderCapped");
    const customerId = await createCustomer(authHeader, "Capped Customer", "capped@test.com");
    const invoiceId = await createInvoice(authHeader, customerId);

    await setStatus(authHeader, invoiceId, "sent");
    await backdateInvoice(invoiceId, { sentDaysAgo: 30, reminderDaysAgo: 10, reminderCount: 3 });

    const sentCount = await sendInvoiceReminders();

    expect(sentCount).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();

    const row = await getQuoteRow(invoiceId);
    expect(row.reminder_count).toBe(3);

  });


  test("a customer with no email on file is skipped, not crashed on", async () => {

    const { authHeader } = await createBusinessAndUser(app, "InvoiceReminderNoEmail");
    const customerId = await createCustomer(authHeader, "No Email Customer", undefined);
    const invoiceId = await createInvoice(authHeader, customerId);

    await setStatus(authHeader, invoiceId, "sent");
    await backdateInvoice(invoiceId, { sentDaysAgo: 10 });

    await expect(sendInvoiceReminders()).resolves.toBeDefined();
    expect(global.fetch).not.toHaveBeenCalled();

  });


  test("a trashed customer's sent invoice is never reminded", async () => {

    const { authHeader } = await createBusinessAndUser(app, "InvoiceReminderTrashed");
    const customerId = await createCustomer(authHeader, "Trashed Customer", "invoicetrashed@test.com");
    const invoiceId = await createInvoice(authHeader, customerId);

    await setStatus(authHeader, invoiceId, "sent");
    await backdateInvoice(invoiceId, { sentDaysAgo: 4 });

    await request(app)
      .delete(`/api/customers/${customerId}`)
      .set("Authorization", authHeader);

    const sentCount = await sendInvoiceReminders();

    expect(sentCount).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();

    const row = await getQuoteRow(invoiceId);
    expect(row.reminder_count).toBe(0);

  });


  test("reminding again respects the 5-day cooldown", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ReminderCooldown");
    const customerId = await createCustomer(authHeader, "Cooldown Customer", "cooldown@test.com");
    const invoiceId = await createInvoice(authHeader, customerId);

    await setStatus(authHeader, invoiceId, "sent");
    await backdateInvoice(invoiceId, { sentDaysAgo: 4 });

    const firstRun = await sendInvoiceReminders();
    expect(firstRun).toBeGreaterThanOrEqual(1);

    global.fetch.mockClear();

    const secondRun = await sendInvoiceReminders();

    expect(secondRun).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();

    const row = await getQuoteRow(invoiceId);
    expect(row.reminder_count).toBe(1);

  });


  test("after the cooldown passes, a second reminder goes out and reminder_count increments again", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ReminderSecond");
    const customerId = await createCustomer(authHeader, "Second Customer", "second@test.com");
    const invoiceId = await createInvoice(authHeader, customerId);

    await setStatus(authHeader, invoiceId, "sent");
    await backdateInvoice(invoiceId, { sentDaysAgo: 20, reminderDaysAgo: 6, reminderCount: 1 });

    const runCount = await sendInvoiceReminders();

    expect(runCount).toBeGreaterThanOrEqual(1);

    const row = await getQuoteRow(invoiceId);
    expect(row.reminder_count).toBe(2);

  });


  test("the email content names the right business", async () => {

    const { authHeader } = await createBusinessAndUser(app, "InvoiceReminderContent");
    const customerId = await createCustomer(authHeader, "Content Customer", "content@test.com");
    const invoiceId = await createInvoice(authHeader, customerId);

    await setStatus(authHeader, invoiceId, "sent");
    await backdateInvoice(invoiceId, { sentDaysAgo: 4 });

    await sendInvoiceReminders();

    const lastCall = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
    const body = JSON.parse(lastCall[1].body);

    expect(body.to).toEqual(["content@test.com"]);
    expect(body.subject).toContain("ReminderContent Business");
    expect(body.html).toContain("ReminderContent Business");

  });


  test("the reminder states the actual amount owed, mentions a deposit if one's required, and its link really logs the customer in", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ReminderLink");
    const customerId = await createCustomer(authHeader, "Link Customer", "link@test.com");

    const created = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        type: "invoice",
        items: [{ description: "Roof repair", quantity: 1, unit_price: 500 }],
        deposit_type: "fixed",
        deposit_value: 100
      });

    await setStatus(authHeader, created.body.id, "sent");
    await backdateInvoice(created.body.id, { sentDaysAgo: 4 });

    await sendInvoiceReminders();

    const lastCall = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
    const body = JSON.parse(lastCall[1].body);

    expect(body.subject).toContain("$500.00");
    expect(body.html).toContain("$500.00");
    expect(body.html).toContain("$100.00 deposit");

    const slugRes = await request(app).get("/api/business").set("Authorization", authHeader);
    const slug = slugRes.body[0].slug;

    const token = body.html.match(/token=([a-f0-9]+)/)[1];

    const verify = await request(app)
      .post(`/api/portal/${slug}/verify`)
      .send({ token });

    expect(verify.status).toBe(200);
    expect(verify.body.token).toBeTruthy();

  });

});
