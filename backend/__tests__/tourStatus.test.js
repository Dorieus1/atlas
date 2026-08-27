const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");

describe("Product tour status", () => {

  // createBusinessAndUser goes through the real POST /api/business ->
  // POST /api/auth/register flow, which never mentions tour_completed -
  // so this is exercising the exact same "brand new signup" path a real
  // business takes, relying on the column's own DEFAULT 0 rather than
  // any test-only shortcut.
  test("a brand new business has not completed the tour", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TourFresh");

    const status = await request(app)
      .get("/api/tour/status")
      .set("Authorization", authHeader);

    expect(status.status).toBe(200);
    expect(status.body.completed).toBe(false);

  });

  test("completing the tour persists, and is scoped to the right business", async () => {

    const bizA = await createBusinessAndUser(app, "TourCompleteA");
    const bizB = await createBusinessAndUser(app, "TourCompleteB");

    const complete = await request(app)
      .patch("/api/tour/complete")
      .set("Authorization", bizA.authHeader);

    expect(complete.status).toBe(200);

    const aStatus = await request(app)
      .get("/api/tour/status")
      .set("Authorization", bizA.authHeader);

    expect(aStatus.body.completed).toBe(true);

    const bStatus = await request(app)
      .get("/api/tour/status")
      .set("Authorization", bizB.authHeader);

    expect(bStatus.body.completed).toBe(false);

  });

  test("the tour endpoints require a valid session, same as any other authenticated route", async () => {

    const status = await request(app).get("/api/tour/status");
    expect(status.status).toBe(401);

    const complete = await request(app).patch("/api/tour/complete");
    expect(complete.status).toBe(401);

  });

});
