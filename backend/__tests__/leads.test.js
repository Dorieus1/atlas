const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");

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

  await request(app)
    .post("/api/chat")
    .set("Authorization", authHeader)
    .send({
      customer_id: customer.body.id,
      message: "I need an estimate for a repair"
    });

  const leads = await waitFor(async () => {

    const res = await request(app)
      .get("/api/leads")
      .set("Authorization", authHeader);

    return res.body.length > 0 ? res : null;

  });

  return { customerId: customer.body.id, lead: leads.body[0] };

};

describe("Leads", () => {

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

});
