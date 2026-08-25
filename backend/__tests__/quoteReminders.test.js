const request = require("supertest");
const app = require("../server");
const db = require("../../database/db");
const { createBusinessAndUser } = require("./setup/helpers");
const { sendQuoteReminders } = require("../services/quoteReminderService");


const createCustomer = async (authHeader, name, email) => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name, email });

  return res.body.id;

};


const createQuote = async (authHeader, customerId) => {

  const res = await request(app)
    .post("/api/quotes")
    .set("Authorization", authHeader)
    .send({
      customer_id: customerId,
      type: "quote",
      items: [{ description: "Roof estimate", quantity: 1, unit_price: 800 }]
    });

  return res.body.id;

};


const setStatus = async (authHeader, quoteId, status) => {

  await request(app)
    .patch(`/api/quotes/${quoteId}`)
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
const backdateQuote = (quoteId, { sentDaysAgo, reminderDaysAgo, reminderCount } = {}) => {

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

  values.push(quoteId);

  return runAsync(`UPDATE quotes SET ${clauses.join(", ")} WHERE id = ?`, values);

};


const getQuoteRow = (quoteId) => {

  return getAsync(
    "SELECT status, sent_at, last_reminder_sent_at, reminder_count FROM quotes WHERE id = ?",
    [quoteId]
  );

};


describe("Quote follow-up reminder emails", () => {

  beforeEach(() => {
    global.fetch.mockClear();
  });


  test("a sent quote 3+ days old with a customer email gets a reminder", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QuoteReminderDue");
    const customerId = await createCustomer(authHeader, "Due Customer", "quotedue@test.com");
    const quoteId = await createQuote(authHeader, customerId);

    await setStatus(authHeader, quoteId, "sent");
    await backdateQuote(quoteId, { sentDaysAgo: 3 });

    const sentCount = await sendQuoteReminders();

    expect(sentCount).toBeGreaterThanOrEqual(1);
    expect(global.fetch).toHaveBeenCalled();

    const row = await getQuoteRow(quoteId);
    expect(row.last_reminder_sent_at).toBeTruthy();
    expect(row.reminder_count).toBe(1);

  });


  test("a freshly-sent quote (under 3 days old) is left alone", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QuoteReminderFresh");
    const customerId = await createCustomer(authHeader, "Fresh Customer", "quotefresh@test.com");
    const quoteId = await createQuote(authHeader, customerId);

    await setStatus(authHeader, quoteId, "sent");

    await sendQuoteReminders();

    const row = await getQuoteRow(quoteId);
    expect(row.last_reminder_sent_at).toBeFalsy();
    expect(row.reminder_count).toBe(0);

  });


  test.each(["draft", "accepted", "declined", "paid"])(
    "a %s quote is never reminded even if old",
    async (status) => {

      const { authHeader } = await createBusinessAndUser(app, `QuoteReminder${status}`);
      const customerId = await createCustomer(authHeader, "Status Customer", `quotestatus-${status}@test.com`);
      const quoteId = await createQuote(authHeader, customerId);

      // Route through "sent" first so sent_at gets stamped, then move on -
      // this exercises the real path a quote would take to reach any of
      // these statuses while still letting us backdate sent_at.
      await setStatus(authHeader, quoteId, "sent");
      await backdateQuote(quoteId, { sentDaysAgo: 10 });

      if (status !== "sent") {
        await setStatus(authHeader, quoteId, status);
      }

      await sendQuoteReminders();

      const row = await getQuoteRow(quoteId);
      expect(row.reminder_count).toBe(0);

    }
  );


  test("a quote already at reminder_count 3 is never reminded again", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QuoteReminderCapped");
    const customerId = await createCustomer(authHeader, "Capped Customer", "quotecapped@test.com");
    const quoteId = await createQuote(authHeader, customerId);

    await setStatus(authHeader, quoteId, "sent");
    await backdateQuote(quoteId, { sentDaysAgo: 30, reminderDaysAgo: 10, reminderCount: 3 });

    const sentCount = await sendQuoteReminders();

    expect(sentCount).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();

    const row = await getQuoteRow(quoteId);
    expect(row.reminder_count).toBe(3);

  });


  test("a customer with no email on file is skipped, not crashed on", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QuoteReminderNoEmail");
    const customerId = await createCustomer(authHeader, "No Email Customer", undefined);
    const quoteId = await createQuote(authHeader, customerId);

    await setStatus(authHeader, quoteId, "sent");
    await backdateQuote(quoteId, { sentDaysAgo: 10 });

    await expect(sendQuoteReminders()).resolves.toBeDefined();
    expect(global.fetch).not.toHaveBeenCalled();

  });


  test("reminding again respects the 4-day cooldown", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QuoteReminderCooldown");
    const customerId = await createCustomer(authHeader, "Cooldown Customer", "quotecooldown@test.com");
    const quoteId = await createQuote(authHeader, customerId);

    await setStatus(authHeader, quoteId, "sent");
    await backdateQuote(quoteId, { sentDaysAgo: 3 });

    const firstRun = await sendQuoteReminders();
    expect(firstRun).toBeGreaterThanOrEqual(1);

    global.fetch.mockClear();

    const secondRun = await sendQuoteReminders();

    expect(secondRun).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();

    const row = await getQuoteRow(quoteId);
    expect(row.reminder_count).toBe(1);

  });


  test("after the cooldown passes, a second reminder goes out and reminder_count increments again", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QuoteReminderSecond");
    const customerId = await createCustomer(authHeader, "Second Customer", "quotesecond@test.com");
    const quoteId = await createQuote(authHeader, customerId);

    await setStatus(authHeader, quoteId, "sent");
    await backdateQuote(quoteId, { sentDaysAgo: 20, reminderDaysAgo: 5, reminderCount: 1 });

    const runCount = await sendQuoteReminders();

    expect(runCount).toBeGreaterThanOrEqual(1);

    const row = await getQuoteRow(quoteId);
    expect(row.reminder_count).toBe(2);

  });


  test("an invoice (not a quote) is never picked up by the quote reminder job", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QuoteReminderInvoiceSkip");
    const customerId = await createCustomer(authHeader, "Invoice Customer", "quoteinvoiceskip@test.com");

    const res = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        type: "invoice",
        items: [{ description: "Roof repair", quantity: 1, unit_price: 500 }]
      });

    const invoiceId = res.body.id;

    await setStatus(authHeader, invoiceId, "sent");
    await backdateQuote(invoiceId, { sentDaysAgo: 10 });

    await sendQuoteReminders();

    const row = await getQuoteRow(invoiceId);
    expect(row.reminder_count).toBe(0);

  });


  test("the email content names the right business and reads as a quote nudge", async () => {

    const { authHeader } = await createBusinessAndUser(app, "QuoteReminderContent");
    const customerId = await createCustomer(authHeader, "Content Customer", "quotecontent@test.com");
    const quoteId = await createQuote(authHeader, customerId);

    await setStatus(authHeader, quoteId, "sent");
    await backdateQuote(quoteId, { sentDaysAgo: 3 });

    await sendQuoteReminders();

    const lastCall = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
    const body = JSON.parse(lastCall[1].body);

    expect(body.to).toEqual(["quotecontent@test.com"]);
    expect(body.subject).toContain("QuoteReminderContent Business");
    expect(body.html).toContain("QuoteReminderContent Business");
    expect(body.html.toLowerCase()).toContain("estimate");

  });

});
