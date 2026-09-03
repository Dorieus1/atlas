const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");

describe("Rate limiting on AI-backed endpoints", () => {

  test("the 31st request in a minute is rate limited, and a different user is unaffected", async () => {

    const userA = await createBusinessAndUser(app, "RateLimitA");
    const userB = await createBusinessAndUser(app, "RateLimitB");

    const statuses = [];

    for (let i = 0; i < 31; i++) {

      const res = await request(app)
        .post("/api/messages")
        .set("Authorization", userA.authHeader)
        .send({});

      statuses.push(res.status);

    }

    const limited = statuses.filter((s) => s === 429).length;
    const underLimit = statuses.filter((s) => s === 400).length;

    expect(underLimit).toBe(30);
    expect(limited).toBe(1);

    const otherUser = await request(app)
      .post("/api/messages")
      .set("Authorization", userB.authHeader)
      .send({});

    expect(otherUser.status).toBe(400);

  });

});


// Regression coverage for a real cross-test flakiness bug this exact
// mechanism was added to fix: every test in a file shares one loopback
// IP, so many independent tests simulating different real-world
// customers all collided on ONE rate-limit bucket for anonymous
// (unauthenticated) routes like the portal's own login/verify - a file
// with enough of them would eventually 429 a later, unrelated test's
// login attempt for no reason connected to that test at all.
describe("X-Test-Client-Id (test-only rate-limit bucketing)", () => {

  test("two different X-Test-Client-Id values get independent buckets, even past the real per-IP limit", async () => {

    const { authHeader } = await createBusinessAndUser(app, "RateLimitTestClientId");

    const res = await request(app)
      .get("/api/business")
      .set("Authorization", authHeader);

    const slug = res.body[0].slug;

    // Exhaust the real /verify limit (10/min) under one test-client-id -
    // an invalid token 400s rather than the wrong-token/expired-token
    // shape, but that's irrelevant here; only the status CODE'S
    // "not 429" vs "429" distinction matters for this test.
    let sawLimited = false;

    for (let i = 0; i < 11; i++) {

      const attempt = await request(app)
        .post(`/api/portal/${slug}/verify`)
        .set("X-Test-Client-Id", "exhausted@test.com")
        .send({ token: "not-a-real-token" });

      if (attempt.status === 429) {
        sawLimited = true;
      }

    }

    expect(sawLimited).toBe(true);

    // A completely different simulated client hitting the SAME endpoint
    // right after must not be affected by the first one's exhausted bucket.
    const otherClient = await request(app)
      .post(`/api/portal/${slug}/verify`)
      .set("X-Test-Client-Id", "fresh@test.com")
      .send({ token: "not-a-real-token" });

    expect(otherClient.status).not.toBe(429);

  });


  test("without the header, real per-IP limiting on an anonymous route is untouched", async () => {

    const { authHeader } = await createBusinessAndUser(app, "RateLimitNoTestHeader");

    const res = await request(app)
      .get("/api/business")
      .set("Authorization", authHeader);

    const slug = res.body[0].slug;

    const statuses = [];

    for (let i = 0; i < 11; i++) {

      const attempt = await request(app)
        .post(`/api/portal/${slug}/verify`)
        .send({ token: "not-a-real-token" });

      statuses.push(attempt.status);

    }

    expect(statuses).toContain(429);

  });

});
