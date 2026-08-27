const request = require("supertest");
const app = require("../server");
const { flushBackgroundWork } = require("../services/chatService");
const { createBusinessAndUser } = require("./setup/helpers");


const createCustomer = async (app, authHeader, name) => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name });

  return res.body.id;

};


// Knowledge-gap detection runs detached from the chat response (it's a
// second OpenAI call and must never delay the customer's reply), so a
// gap this test expects to exist is not saved yet the instant the chat
// request resolves. flushBackgroundWork() waits for that detached work
// to finish - deterministically, so we neither poll on a timeout nor
// leave a half-finished background call to bleed into the next test and
// consume a mock response queued for it.
const waitForGaps = async (app, authHeader) => {

  await flushBackgroundWork();

  return request(app)
    .get("/api/knowledge-gaps")
    .set("Authorization", authHeader);

};


describe("Self-improving knowledge base (knowledge gaps)", () => {

  beforeEach(() => {
    // mockReset (not mockClear) so no `mockResolvedValueOnce` value
    // queued by a previous test survives into this one; then put back
    // the always-on default that setup/mockOpenai.js installs.
    global.__mockOpenAICreate.mockReset();
    global.__mockOpenAICreate.mockResolvedValue({ output_text: "hot" });
  });

  afterEach(async () => {
    // Drain any still-running detached lead-/gap-detection call before
    // the next test resets the mock, so it can't consume that test's
    // queued responses.
    await flushBackgroundWork();
  });


  test("a chat reply the AI flags as a gap creates a suggestion and notifies the owner", async () => {

    const { authHeader } = await createBusinessAndUser(app, "GapDetected");
    const customerId = await createCustomer(app, authHeader, "Gap Customer");

    global.__mockOpenAICreate
      .mockResolvedValueOnce({ output_text: "I'm not totally sure, let me find out for you." })
      // classifyLead runs concurrently (runLeadDetection) and draws from
      // this same shared mock queue - pinned to "cold" here so it can't
      // eat the gap-detection response meant for the next call below.
      .mockResolvedValueOnce({ output_text: "cold" })
      .mockResolvedValueOnce({

        output_text: JSON.stringify({
          has_gap: true,
          suggested_title: "Warranty policy",
          suggested_content: "We offer a 5-year warranty on all roofing labor."
        })

      });

    const chat = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, message: "Do you offer any kind of warranty?" });

    expect(chat.status).toBe(200);

    const gaps = await waitForGaps(app, authHeader);

    expect(gaps.status).toBe(200);
    expect(gaps.body.length).toBe(1);
    expect(gaps.body[0].suggested_title).toBe("Warranty policy");
    expect(gaps.body[0].question).toBe("Do you offer any kind of warranty?");

    const notifications = await request(app)
      .get("/api/notifications")
      .set("Authorization", authHeader);

    expect(notifications.body.some((n) => n.type === "knowledge_gap")).toBe(true);

  });


  test("a confident reply with no gap creates no suggestion", async () => {

    const { authHeader } = await createBusinessAndUser(app, "GapNone");
    const customerId = await createCustomer(app, authHeader, "No Gap Customer");

    global.__mockOpenAICreate
      .mockResolvedValueOnce({ output_text: "We're open 9-5, Monday through Friday." })
      .mockResolvedValueOnce({ output_text: "cold" })
      .mockResolvedValueOnce({ output_text: JSON.stringify({ has_gap: false }) });

    await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, message: "What are your hours?" });

    const gaps = await waitForGaps(app, authHeader);

    expect(gaps.body.length).toBe(0);

  });


  test("a malformed gap-detection response is swallowed - the chat reply itself still succeeds", async () => {

    const { authHeader } = await createBusinessAndUser(app, "GapMalformed");
    const customerId = await createCustomer(app, authHeader, "Malformed Customer");

    global.__mockOpenAICreate
      .mockResolvedValueOnce({ output_text: "Here's an answer for you." })
      .mockResolvedValueOnce({ output_text: "cold" })
      .mockResolvedValueOnce({ output_text: "not json at all" });

    const chat = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, message: "Random question" });

    expect(chat.status).toBe(200);
    expect(chat.body.reply).toBe("Here's an answer for you.");

    const gaps = await waitForGaps(app, authHeader);

    expect(gaps.body.length).toBe(0);

  });


  test("approving a gap creates a real knowledge entry and removes it from the pending list", async () => {

    const { authHeader } = await createBusinessAndUser(app, "GapApprove");
    const customerId = await createCustomer(app, authHeader, "Approve Customer");

    global.__mockOpenAICreate
      .mockResolvedValueOnce({ output_text: "I believe so, but let me confirm." })
      .mockResolvedValueOnce({ output_text: "cold" })
      .mockResolvedValueOnce({

        output_text: JSON.stringify({
          has_gap: true,
          suggested_title: "Emergency service",
          suggested_content: "Yes, we offer 24/7 emergency service for active leaks."
        })

      });

    await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, message: "Do you do emergency calls?" });

    const gaps = await waitForGaps(app, authHeader);

    const gapId = gaps.body[0].id;

    const approve = await request(app)
      .post(`/api/knowledge-gaps/${gapId}/approve`)
      .set("Authorization", authHeader)
      .send({});

    expect(approve.status).toBe(201);

    const biz = await request(app).get("/api/business").set("Authorization", authHeader);
    const knowledge = await request(app).get(`/api/knowledge/${biz.body[0].id}`).set("Authorization", authHeader);

    expect(knowledge.body.some((k) => k.title === "Emergency service")).toBe(true);

    const remaining = await request(app)
      .get("/api/knowledge-gaps")
      .set("Authorization", authHeader);

    expect(remaining.body.length).toBe(0);

  });


  test("approving a gap with an edited title/content saves the edited version, not the raw suggestion", async () => {

    const { authHeader } = await createBusinessAndUser(app, "GapApproveEdited");
    const customerId = await createCustomer(app, authHeader, "Edited Customer");

    global.__mockOpenAICreate
      .mockResolvedValueOnce({ output_text: "Not sure, I'll check." })
      .mockResolvedValueOnce({ output_text: "cold" })
      .mockResolvedValueOnce({

        output_text: JSON.stringify({
          has_gap: true,
          suggested_title: "Draft title",
          suggested_content: "Draft content"
        })

      });

    await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, message: "Some question" });

    const gaps = await waitForGaps(app, authHeader);

    const approve = await request(app)
      .post(`/api/knowledge-gaps/${gaps.body[0].id}/approve`)
      .set("Authorization", authHeader)
      .send({ title: "Edited title", content: "Edited content" });

    expect(approve.status).toBe(201);

    const biz = await request(app).get("/api/business").set("Authorization", authHeader);
    const knowledge = await request(app).get(`/api/knowledge/${biz.body[0].id}`).set("Authorization", authHeader);

    expect(knowledge.body.some((k) => k.title === "Edited title")).toBe(true);
    expect(knowledge.body.some((k) => k.title === "Draft title")).toBe(false);

  });


  test("dismissing a gap removes it from the pending list without creating a knowledge entry", async () => {

    const { authHeader } = await createBusinessAndUser(app, "GapDismiss");
    const customerId = await createCustomer(app, authHeader, "Dismiss Customer");

    global.__mockOpenAICreate
      .mockResolvedValueOnce({ output_text: "Hmm, good question." })
      .mockResolvedValueOnce({ output_text: "cold" })
      .mockResolvedValueOnce({

        output_text: JSON.stringify({
          has_gap: true,
          suggested_title: "Irrelevant suggestion",
          suggested_content: "Not actually useful."
        })

      });

    await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, message: "Some question" });

    const gaps = await waitForGaps(app, authHeader);

    const dismiss = await request(app)
      .post(`/api/knowledge-gaps/${gaps.body[0].id}/dismiss`)
      .set("Authorization", authHeader);

    expect(dismiss.status).toBe(200);

    const remaining = await request(app)
      .get("/api/knowledge-gaps")
      .set("Authorization", authHeader);

    expect(remaining.body.length).toBe(0);

    const biz = await request(app).get("/api/business").set("Authorization", authHeader);
    const knowledge = await request(app).get(`/api/knowledge/${biz.body[0].id}`).set("Authorization", authHeader);

    expect(knowledge.body.some((k) => k.title === "Irrelevant suggestion")).toBe(false);

  });


  test("gaps, approval, and dismissal are all scoped to the right business", async () => {

    const bizA = await createBusinessAndUser(app, "GapScopeA");
    const bizB = await createBusinessAndUser(app, "GapScopeB");
    const customerId = await createCustomer(app, bizA.authHeader, "Scope Customer");

    global.__mockOpenAICreate
      .mockResolvedValueOnce({ output_text: "Not sure." })
      .mockResolvedValueOnce({ output_text: "cold" })
      .mockResolvedValueOnce({

        output_text: JSON.stringify({
          has_gap: true,
          suggested_title: "A's suggestion",
          suggested_content: "Content"
        })

      });

    await request(app)
      .post("/api/chat")
      .set("Authorization", bizA.authHeader)
      .send({ customer_id: customerId, message: "Some question" });

    const bList = await request(app)
      .get("/api/knowledge-gaps")
      .set("Authorization", bizB.authHeader);

    expect(bList.body.length).toBe(0);

    const aList = await waitForGaps(app, bizA.authHeader);

    const gapId = aList.body[0].id;

    const bApprove = await request(app)
      .post(`/api/knowledge-gaps/${gapId}/approve`)
      .set("Authorization", bizB.authHeader)
      .send({});

    expect(bApprove.status).toBe(404);

    const bDismiss = await request(app)
      .post(`/api/knowledge-gaps/${gapId}/dismiss`)
      .set("Authorization", bizB.authHeader);

    expect(bDismiss.status).toBe(404);

  });

});
