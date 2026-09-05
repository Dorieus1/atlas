const request = require("supertest");
const app = require("../server");
const { flushBackgroundWork } = require("../services/chatService");
const { createBusinessAndUser, sendChatMessage } = require("./setup/helpers");


// Same reasoning as chatBooking.test.js's own copy of this helper -
// classifyLead and detectKnowledgeGap share the same mocked OpenAI
// client, each with their own distinctly-worded instructions block, so
// this filters the mock's call log down to just the real chat-reply
// calls (generateAIResponse) this file actually cares about.
const replyCalls = () =>
  global.__mockOpenAICreate.mock.calls
    .map((call) => call[0])
    .filter((callArgs) => callArgs.instructions.includes("You are Atlas AI"));


describe("Real conversation history threaded into the AI's context", () => {

  beforeEach(() => {
    global.__mockOpenAICreate.mockReset();
    global.__mockOpenAICreate.mockResolvedValue({ output_text: "cold" });
  });


  test("a second message includes the first exchange as real prior turns, not just the new message", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ChatHistoryBasic");

    const customer = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "History Customer" });

    global.__mockOpenAICreate.mockResolvedValueOnce({ output_text: "Sure, what's the address?" });

    await sendChatMessage(app, authHeader, customer.body.id, "I'd like to schedule a visit");
    await flushBackgroundWork();

    global.__mockOpenAICreate.mockResolvedValueOnce({ output_text: "Got it, thanks!" });

    await sendChatMessage(app, authHeader, customer.body.id, "123 Main Street");
    await flushBackgroundWork();

    const calls = replyCalls();

    expect(calls).toHaveLength(2);

    // The FIRST message's own call has no history yet - nothing to
    // thread in before the customer's very first message.
    expect(calls[0].input).toEqual([
      { role: "user", content: "I'd like to schedule a visit" }
    ]);

    // The SECOND call sees the whole first exchange as real prior
    // turns (not summarized, not just an extracted "memory") ahead of
    // the new message.
    expect(calls[1].input).toEqual([
      { role: "user", content: "I'd like to schedule a visit" },
      { role: "assistant", content: "Sure, what's the address?" },
      { role: "user", content: "123 Main Street" }
    ]);

  });


  test("history is capped, not unbounded - only the most recent exchanges are kept", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ChatHistoryCap");

    const customer = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Chatty Customer" });

    // MAX_HISTORY_TURNS (aiService.js) is 6 - send 8 real exchanges,
    // one at a time so each has a real, distinct reply on record, then
    // confirm the 9th message's call only carries the most recent 6.
    for (let i = 1; i <= 8; i++) {

      global.__mockOpenAICreate.mockResolvedValueOnce({ output_text: `reply ${i}` });
      await sendChatMessage(app, authHeader, customer.body.id, `message ${i}`);
      await flushBackgroundWork();

    }

    global.__mockOpenAICreate.mockResolvedValueOnce({ output_text: "reply 9" });
    await sendChatMessage(app, authHeader, customer.body.id, "message 9");
    await flushBackgroundWork();

    const lastCall = replyCalls().pop();

    // 6 capped exchanges (messages 3-8) = 12 prior turns, plus the new
    // 9th message = 13 entries. Messages 1 and 2 must have aged out.
    expect(lastCall.input).toHaveLength(13);
    expect(lastCall.input[0]).toEqual({ role: "user", content: "message 3" });
    expect(lastCall.input).not.toContainEqual({ role: "user", content: "message 1" });
    expect(lastCall.input).not.toContainEqual({ role: "user", content: "message 2" });
    expect(lastCall.input[lastCall.input.length - 1]).toEqual({ role: "user", content: "message 9" });

  });


  test("the internal preview box (Test Atlas) sees the same real history a real customer message would, without saving a new turn to it", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ChatHistoryPreview");

    const customer = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Preview Customer" });

    global.__mockOpenAICreate.mockResolvedValueOnce({ output_text: "Sure, what's the address?" });

    await sendChatMessage(app, authHeader, customer.body.id, "I'd like to schedule a visit");
    await flushBackgroundWork();

    global.__mockOpenAICreate.mockResolvedValueOnce({ output_text: "This is only a preview reply." });

    await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ customer_id: customer.body.id, message: "just testing this out" });

    const calls = replyCalls();
    const previewCall = calls[calls.length - 1];

    // The preview call still sees the real prior exchange for context...
    expect(previewCall.input[0]).toEqual({ role: "user", content: "I'd like to schedule a visit" });
    expect(previewCall.input[1]).toEqual({ role: "assistant", content: "Sure, what's the address?" });

    // ...but the preview message itself never got saved as a new turn -
    // the real conversation history is exactly what it was before this
    // preview ran, not a mix of real and preview turns.
    const history = await request(app)
      .get(`/api/conversations/${customer.body.id}`)
      .set("Authorization", authHeader);

    expect(history.body).toHaveLength(1);
    expect(history.body[0].message).toBe("I'd like to schedule a visit");

  });

});
