const request = require("supertest");
const jwt = require("jsonwebtoken");

const createBusinessAndUser = async (app, prefix) => {

  const businessRes = await request(app)
    .post("/api/business")
    .send({ name: `${prefix} Business` });

  const business_id = businessRes.body.id;

  const registerRes = await request(app)
    .post("/api/auth/register")
    .send({
      business_id,
      name: "Test Owner",
      email: `${prefix.toLowerCase()}@test.com`,
      password: "testpass123"
    });

  const userId = registerRes.body.id;

  // Fails loudly here rather than silently minting a token for a
  // non-existent user - that used to happen invisibly (a duplicate
  // test-fixture email prefix across two files, e.g. two files both
  // using "ReminderDue", made the SECOND file's register call 409, and
  // the old HTTP-based login step would then silently succeed against
  // the FIRST file's business by password match alone, quietly running
  // that "isolated" test against someone else's business). A clear
  // error here points straight at a duplicate prefix instead of a
  // confusing 401 several requests later.
  if (registerRes.status !== 200 || !userId) {

    throw new Error(
      `createBusinessAndUser("${prefix}") failed to register a test user ` +
      `(status ${registerRes.status}: ${JSON.stringify(registerRes.body)}). ` +
      `This usually means another test file already uses the same prefix - ` +
      `prefixes must be unique across the whole suite, since they become ` +
      `"${prefix.toLowerCase()}@test.com".`
    );

  }

  // Signed directly rather than going through POST /api/auth/login -
  // this helper runs for nearly every test in the suite (hundreds of
  // calls), and /login is now rate-limited (see routes/auth.js) to
  // guard against real brute-force attempts. Hitting the real endpoint
  // just for test fixture setup would trip that same limit almost
  // immediately; auth.test.js is what actually exercises the real login
  // endpoint. Mirrors login's own token shape exactly (see login() in
  // authController.js) so it behaves identically for every test that
  // uses the resulting authHeader.
  const token = jwt.sign(
    { id: userId, business_id },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  return {
    business_id,
    token,
    authHeader: `Bearer ${token}`,
    userId
  };

};



// Sends a message through the exact pipeline a REAL customer's message
// takes (the public chat widget - see routes/public.js's sendPublicMessage),
// not the internal, authenticated /api/chat endpoint the CRM's own "Test
// Atlas" preview box uses. Since the preview fix (see chatService's
// `preview` option), /api/chat never saves a conversation, never creates a
// lead/activity/memory/knowledge-gap, and never books a real appointment -
// so any test that needs one of those real side effects to actually happen
// has to go through here instead, exactly like a real customer would.
// Reuses whatever customer_id the caller already has (from the normal
// authenticated POST /api/customers, say) - sendPublicMessage only needs
// that customer to belong to the business the slug resolves to, it doesn't
// care whether the customer was created through the public /start flow or
// not.
const sendChatMessage = async (app, authHeader, customerId, message) => {

  const business = (await request(app).get("/api/business").set("Authorization", authHeader)).body[0];

  return request(app)
    .post(`/api/public/${business.slug}/chat`)
    .send({ customer_id: customerId, message });

};


module.exports = { createBusinessAndUser, sendChatMessage };
