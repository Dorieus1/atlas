const request = require("supertest");
const app = require("../server");
const { flushBackgroundWork } = require("../services/chatService");
const { createBusinessAndUser } = require("./setup/helpers");


// Same reference dates businessHours.test.js already established:
// 2026-09-14 is a Monday.
const WEEKDAY_HOURS = {
  mon: { open: "09:00", close: "17:00" },
  tue: { open: "09:00", close: "17:00" },
  wed: { open: "09:00", close: "17:00" },
  thu: { open: "09:00", close: "17:00" },
  fri: { open: "09:00", close: "17:00" },
  sat: null,
  sun: null
};


const setBusinessHours = async (authHeader, businessName, businessHours) => {

  return request(app)
    .put("/api/business")
    .set("Authorization", authHeader)
    .send({ name: businessName, business_hours: businessHours, timezone: "UTC" });

};


// Distinguishes generateAIResponse's own calls to the shared mock from
// classifyLead's/detectKnowledgeGap's - each function has its own,
// distinctly-worded instructions block.
const replyCalls = () =>
  global.__mockOpenAICreate.mock.calls
    .map((call) => call[0])
    .filter((callArgs) => callArgs.instructions.includes("You are Atlas AI"));


describe("AI chat booking tools", () => {

  beforeEach(() => {
    global.__mockOpenAICreate.mockReset();
    global.__mockOpenAICreate.mockResolvedValue({ output_text: "cold" });
  });

  afterEach(async () => {
    await flushBackgroundWork();
  });


  test("tools are not offered to the model when the business has no hours configured", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ChatToolsNoHours");

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "No Hours Customer" });

    await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerRes.body.id, message: "Can I book something?" });

    const [callArgs] = replyCalls();

    expect(callArgs.tools).toBeUndefined();
    expect(callArgs.instructions).not.toContain("check_availability");

  });


  test("tools ARE offered once the business has real hours configured", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ChatToolsWithHours");
    await setBusinessHours(authHeader, "ChatToolsWithHours Business", WEEKDAY_HOURS);

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Hours Customer" });

    global.__mockOpenAICreate.mockResolvedValueOnce({ output_text: "Sure, what day works for you?" });

    await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerRes.body.id, message: "Can I book something?" });

    const [callArgs] = replyCalls();

    expect(callArgs.tools).toHaveLength(2);
    expect(callArgs.tools.map((t) => t.name).sort()).toEqual(["book_appointment", "check_availability"]);
    expect(callArgs.instructions).toContain("check_availability");

  });


  test("a check_availability tool call gets real slot data fed back, and the final reply is returned", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ChatCheckAvailability");
    await setBusinessHours(authHeader, "ChatCheckAvailability Business", WEEKDAY_HOURS);

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Availability Customer" });

    global.__mockOpenAICreate.mockResolvedValueOnce({

      output_text: "",

      output: [{ type: "function_call", call_id: "call_1", name: "check_availability", arguments: "{}" }]

    });

    global.__mockOpenAICreate.mockResolvedValueOnce({
      output_text: "We have Tuesday the 15th at 9am, or several other times that week."
    });

    const res = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerRes.body.id, message: "What do you have open this week?" });

    expect(res.status).toBe(200);
    expect(res.body.reply).toBe("We have Tuesday the 15th at 9am, or several other times that week.");

    const [, secondCallArgs] = replyCalls();

    const toolOutputItem = secondCallArgs.input.find((item) => item.type === "function_call_output");

    expect(toolOutputItem.call_id).toBe("call_1");

    const parsed = JSON.parse(toolOutputItem.output);

    expect(parsed.days.length).toBeGreaterThan(0);
    // A real day carries real, non-empty local-time slot labels for an
    // open weekday - this is the actual availability engine's output,
    // not a stub.
    const openDay = parsed.days.find((d) => d.status === "open");
    expect(openDay.slots[0].start_time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(openDay.slots[0].time_label).toBeTruthy();

  });


  test("a book_appointment tool call creates a real 'requested' appointment and notifies the owner", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ChatBookAppointment");
    await setBusinessHours(authHeader, "ChatBookAppointment Business", WEEKDAY_HOURS);

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Booking Customer" });

    global.__mockOpenAICreate.mockResolvedValueOnce({

      output_text: "",

      output: [{
        type: "function_call",
        call_id: "call_1",
        name: "book_appointment",
        arguments: JSON.stringify({ start_time: "2026-09-14T10:00:00.000Z", title: "Leaky faucet" })
      }]

    });

    global.__mockOpenAICreate.mockResolvedValueOnce({
      output_text: "You're all set for Monday at 10am!"
    });

    const res = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerRes.body.id, message: "Book me for Monday at 10am please" });

    expect(res.status).toBe(200);
    expect(res.body.reply).toBe("You're all set for Monday at 10am!");

    const appts = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const created = appts.body.find((a) => a.start_time === "2026-09-14T10:00:00.000Z");

    expect(created).toBeTruthy();
    expect(created.status).toBe("requested");
    expect(created.title).toBe("Leaky faucet");
    expect(created.customer_name).toBe("Booking Customer");

    const notifications = await request(app)
      .get("/api/notifications")
      .set("Authorization", authHeader);

    expect(notifications.body.some((n) => n.type === "appointment_requested" && n.title.includes("via chat"))).toBe(true);

  });


  test("the model can't book a slot that's already taken - the tool reports failure, not a silent double-booking", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ChatBookConflict");
    await setBusinessHours(authHeader, "ChatBookConflict Business", WEEKDAY_HOURS);

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Conflict Customer" });

    // Something else already booked that exact time.
    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ title: "Existing job", start_time: "2026-09-14T10:00:00.000Z", end_time: "2026-09-14T11:00:00.000Z" });

    global.__mockOpenAICreate.mockResolvedValueOnce({

      output_text: "",

      output: [{
        type: "function_call",
        call_id: "call_1",
        name: "book_appointment",
        arguments: JSON.stringify({ start_time: "2026-09-14T10:00:00.000Z" })
      }]

    });

    global.__mockOpenAICreate.mockResolvedValueOnce({
      output_text: "It looks like that time was just taken - want me to check other options?"
    });

    await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerRes.body.id, message: "Book me for Monday at 10am" });

    const [, secondCallArgs] = replyCalls();
    const toolOutputItem = secondCallArgs.input.find((item) => item.type === "function_call_output");
    const parsed = JSON.parse(toolOutputItem.output);

    expect(parsed.success).toBe(false);

    const appts = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const atThatTime = appts.body.filter((a) => a.start_time === "2026-09-14T10:00:00.000Z");

    // Still just the one pre-existing appointment - not two.
    expect(atThatTime).toHaveLength(1);

  });


  test("malformed tool call arguments don't crash the reply", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ChatMalformedArgs");
    await setBusinessHours(authHeader, "ChatMalformedArgs Business", WEEKDAY_HOURS);

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Malformed Customer" });

    global.__mockOpenAICreate.mockResolvedValueOnce({

      output_text: "",

      output: [{ type: "function_call", call_id: "call_1", name: "check_availability", arguments: "not valid json{{{" }]

    });

    global.__mockOpenAICreate.mockResolvedValueOnce({
      output_text: "Here's what I found."
    });

    const res = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerRes.body.id, message: "What's open?" });

    expect(res.status).toBe(200);
    expect(res.body.reply).toBe("Here's what I found.");

  });


  test("the tool loop terminates even if the model never stops calling tools", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ChatToolLoopCap");
    await setBusinessHours(authHeader, "ChatToolLoopCap Business", WEEKDAY_HOURS);

    const customerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Loop Customer" });

    // Every single call (including this test's own background lead/gap
    // detection calls, which don't care about `output` at all) returns a
    // function_call - generateAIResponse's own loop must still stop on
    // its own turn cap rather than looping forever.
    global.__mockOpenAICreate.mockResolvedValue({

      output_text: "",

      output: [{ type: "function_call", call_id: "call_x", name: "check_availability", arguments: "{}" }]

    });

    const res = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customerRes.body.id, message: "What's open?" });

    expect(res.status).toBe(200);

    // 1 initial call + MAX_TOOL_TURNS(4) follow-ups = 5 calls, never
    // unbounded.
    expect(replyCalls().length).toBeLessThanOrEqual(5);

  });

});
