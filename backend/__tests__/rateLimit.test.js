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
