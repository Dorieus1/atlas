const request = require("supertest");
const app = require("../server");
const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");
const { createBusinessAndUser, sendChatMessage } = require("./setup/helpers");
const { flushBackgroundWork } = require("../services/chatService");

const runAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });
  });

};

// No dedicated "create a lead directly" route (leads only ever come
// from chat) - inserted straight into the table, same pattern
// analytics.test.js already uses for the same reason. sentAt lets a
// test control ordering explicitly, since hasOpenLead's whole bug was
// about which of a customer's leads is newest.
const insertLead = (business_id, customer_id, status, createdAt) => {

  return runAsync(

    `
    INSERT INTO leads (id, customer_id, business_id, name, priority, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,

    [uuidv4(), customer_id, business_id, "Direct Insert Lead", "warm", status, createdAt]

  );

};

// Lead creation now runs detached from the chat response (see
// chatService.js's runLeadDetection), so it isn't guaranteed to exist
// the instant POST /api/chat returns. Polls briefly rather than
// asserting immediately.
const waitFor = async (checkFn, { timeout = 1000, interval = 20 } = {}) => {

  const start = Date.now();

  while (true) {

    const result = await checkFn();

    if (result || Date.now() - start > timeout) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));

  }

};

const createCustomerWithLead = async (app, authHeader, customerName, phone) => {

  const customer = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name: customerName, phone });

  await sendChatMessage(app, authHeader, customer.body.id, "I need an estimate for a repair");

  const leads = await waitFor(async () => {

    const res = await request(app)
      .get("/api/leads")
      .set("Authorization", authHeader);

    return res.body.length > 0 ? res : null;

  });

  return { customerId: customer.body.id, lead: leads.body[0] };

};

describe("Leads", () => {

  // mockReset (not mockClear) so a `mockImplementation` a test overrides
  // (e.g. the race test below, which needs a real delay to reproduce a
  // real race) can never survive into the next test - same convention
  // assistant.test.js/aiFailure.test.js/chatBooking.test.js already use.
  // This file didn't need its own reset before now because nothing in
  // it touched the mock beyond the plain default mockOpenai.js sets up
  // once; the race test below is the first thing here that does.
  beforeEach(() => {
    global.__mockOpenAICreate.mockReset();
    global.__mockOpenAICreate.mockResolvedValue({ output_text: "hot" });
  });

  test("a chat message with buying intent automatically creates a lead", async () => {

    const { authHeader } = await createBusinessAndUser(app, "LeadCreate");

    const { lead } = await createCustomerWithLead(app, authHeader, "Lead Customer");

    expect(lead).toBeTruthy();
    expect(lead.status).toBe("new");

  });

  test("a lead created from chat inherits the customer's phone number", async () => {

    const { authHeader } = await createBusinessAndUser(app, "LeadPhone");

    const { lead } = await createCustomerWithLead(app, authHeader, "Phone Lead Customer", "555-0142");

    expect(lead.phone).toBe("555-0142");

  });

  // Regression test for a real bug found during live testing: a second
  // buying-intent message from the same customer, in the same ongoing
  // conversation, was creating a SECOND lead card (plus a duplicate
  // follow-up task and notification) instead of leaving the existing
  // open opportunity alone.
  test("a second buying-intent message in the same conversation does not create a duplicate lead", async () => {

    const { authHeader } = await createBusinessAndUser(app, "LeadNoDuplicate");

    const { customerId, lead } = await createCustomerWithLead(app, authHeader, "No Duplicate Customer");

    await sendChatMessage(app, authHeader, customerId, "Also, how soon could someone come out?");

    // No waitFor here on purpose - there's nothing new to wait for. A
    // short real delay is what actually proves the second message's
    // detached lead-detection had time to run and correctly did nothing,
    // rather than the test just not having waited long enough to see a
    // duplicate that would show up later.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const leads = await request(app)
      .get("/api/leads")
      .set("Authorization", authHeader);

    expect(leads.body.length).toBe(1);
    expect(leads.body[0].id).toBe(lead.id);

  });

  // Regression test for a real race a bug-hunt review found: the test
  // above only proves SEQUENTIAL dedup (the second message's detection
  // runs once a lead already exists). The actual bug needed two
  // messages' detached lead-detection to genuinely overlap - a plain
  // sequential test can never reproduce that because the mock's default
  // instant response means the first message's whole detached pipeline
  // reliably finishes before the second request even lands. A real
  // classifyLead() call is a slow OpenAI round-trip, so this gives the
  // mock a real (short) delay to open that same window on purpose, then
  // fires both messages without awaiting between them.
  test("two buying-intent messages sent at nearly the same time only create one lead (a real race, not just sequential dedup)", async () => {

    const { authHeader } = await createBusinessAndUser(app, "LeadRace");

    const customer = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Race Customer" });

    const business = (await request(app).get("/api/business").set("Authorization", authHeader)).body[0];

    global.__mockOpenAICreate.mockImplementation(() =>

      new Promise((resolve) => setTimeout(() => resolve({ output_text: "hot" }), 50))

    );

    await Promise.all([

      request(app)
        .post(`/api/public/${business.slug}/chat`)
        .send({ customer_id: customer.body.id, message: "I need an estimate for a repair" }),

      request(app)
        .post(`/api/public/${business.slug}/chat`)
        .send({ customer_id: customer.body.id, message: "Also, how soon could someone come out?" })

    ]);

    await flushBackgroundWork();

    const leads = await request(app)
      .get("/api/leads")
      .set("Authorization", authHeader);

    expect(leads.body.length).toBe(1);

  });

  test("a new message after the existing lead is closed creates a fresh lead - a returning customer is a new opportunity", async () => {

    const { authHeader } = await createBusinessAndUser(app, "LeadReopenAfterClosed");

    const { customerId, lead } = await createCustomerWithLead(app, authHeader, "Reopen Customer");

    await request(app)
      .patch(`/api/leads/${lead.id}`)
      .set("Authorization", authHeader)
      .send({ status: "closed" });

    await sendChatMessage(app, authHeader, customerId, "I'd like to book another repair");

    const leads = await waitFor(async () => {

      const res = await request(app)
        .get("/api/leads")
        .set("Authorization", authHeader);

      return res.body.length > 1 ? res : null;

    });

    expect(leads.body.length).toBe(2);

  });

  // Regression test for a gap a peer review caught in the fix above:
  // the dedup check must look at whether the customer has ANY open
  // lead, not just their single most recent one. An older lead can
  // still be genuinely open (staff handled it by phone and never
  // updated its status) while a NEWER lead for the same customer
  // happens to be closed - checking only the newest row would see
  // "closed" and wrongly create a duplicate open lead alongside the
  // still-open older one.
  test("an older still-open lead blocks a new one, even if the customer's most recent lead is already closed", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "LeadOlderStillOpen");

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Older Open Lead Customer" });

    const customerId = customerRes.body.id;

    // Older lead, still open ("contacted") - created first.
    await insertLead(business_id, customerId, "contacted", "2026-01-01T00:00:00.000Z");

    // Newer lead, already closed - created after, so it's the one
    // getCustomerLead's own "most recent" query would return.
    await insertLead(business_id, customerId, "closed", "2026-01-02T00:00:00.000Z");

    await sendChatMessage(app, authHeader, customerId, "Following up on my repair request");

    // No waitFor here on purpose, same reasoning as the duplicate-
    // message test above - there's nothing new to wait for, and a short
    // real delay is what actually proves the detached lead detection
    // ran and correctly did nothing.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const leads = await request(app)
      .get("/api/leads")
      .set("Authorization", authHeader);

    // Still exactly the two seeded leads - no third one snuck in.
    expect(leads.body.length).toBe(2);

  });

  test("status must be one of the real values, garbage is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "LeadStatusValidation");

    const { lead } = await createCustomerWithLead(app, authHeader, "Status Customer");

    const garbage = await request(app)
      .patch(`/api/leads/${lead.id}`)
      .set("Authorization", authHeader)
      .send({ status: "banana_garbage_status" });

    expect(garbage.status).toBe(400);

    const valid = await request(app)
      .patch(`/api/leads/${lead.id}`)
      .set("Authorization", authHeader)
      .send({ status: "qualified" });

    expect(valid.status).toBe(200);

    const list = await request(app)
      .get("/api/leads")
      .set("Authorization", authHeader);

    expect(list.body[0].status).toBe("qualified");

  });

  test("one business cannot see or change another business's lead", async () => {

    const bizA = await createBusinessAndUser(app, "LeadIsoA");
    const bizB = await createBusinessAndUser(app, "LeadIsoB");

    const { lead } = await createCustomerWithLead(app, bizA.authHeader, "A's Lead Customer");

    const bList = await request(app)
      .get("/api/leads")
      .set("Authorization", bizB.authHeader);

    expect(bList.body).toHaveLength(0);

    const editAttempt = await request(app)
      .patch(`/api/leads/${lead.id}`)
      .set("Authorization", bizB.authHeader)
      .send({ status: "closed" });

    expect(editAttempt.status).toBe(404);

    const stillNew = await request(app)
      .get("/api/leads")
      .set("Authorization", bizA.authHeader);

    expect(stillNew.body[0].status).toBe("new");

  });

  test("a lead's source can be set, cleared, and is validated against the allowlist", async () => {

    const { authHeader } = await createBusinessAndUser(app, "LeadSourceValidation");

    const { lead } = await createCustomerWithLead(app, authHeader, "Source Customer");

    const garbage = await request(app)
      .patch(`/api/leads/${lead.id}/source`)
      .set("Authorization", authHeader)
      .send({ source: "carrier_pigeon" });

    expect(garbage.status).toBe(400);

    const valid = await request(app)
      .patch(`/api/leads/${lead.id}/source`)
      .set("Authorization", authHeader)
      .send({ source: "referral" });

    expect(valid.status).toBe(200);

    const afterSet = await request(app)
      .get("/api/leads")
      .set("Authorization", authHeader);

    expect(afterSet.body[0].source).toBe("referral");

    // Clearing back to "not set" (the owner picked the wrong one) is a
    // valid, deliberate action, not something the allowlist should
    // reject as "not a real source".
    const cleared = await request(app)
      .patch(`/api/leads/${lead.id}/source`)
      .set("Authorization", authHeader)
      .send({ source: "" });

    expect(cleared.status).toBe(200);

    const afterClear = await request(app)
      .get("/api/leads")
      .set("Authorization", authHeader);

    expect(afterClear.body[0].source).toBeFalsy();

  });

  test("one business cannot set another business's lead source", async () => {

    const bizA = await createBusinessAndUser(app, "LeadSourceIsoA");
    const bizB = await createBusinessAndUser(app, "LeadSourceIsoB");

    const { lead } = await createCustomerWithLead(app, bizA.authHeader, "A's Source Customer");

    const editAttempt = await request(app)
      .patch(`/api/leads/${lead.id}/source`)
      .set("Authorization", bizB.authHeader)
      .send({ source: "google" });

    expect(editAttempt.status).toBe(404);

  });

});
