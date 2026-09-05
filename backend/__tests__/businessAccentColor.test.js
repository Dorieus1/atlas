const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");


describe("Business accent color", () => {

  test("is unset (null) by default for a brand new business", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AccentDefault");

    const res = await request(app)
      .get("/api/business")
      .set("Authorization", authHeader);

    expect(res.body[0].accent_color).toBeNull();

  });


  test("can be set to any real option and round-trips", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AccentSet");

    const update = await request(app)
      .put("/api/business")
      .set("Authorization", authHeader)
      .send({ name: "AccentSet Business", accent_color: "blue" });

    expect(update.status).toBe(200);

    const res = await request(app)
      .get("/api/business")
      .set("Authorization", authHeader);

    expect(res.body[0].accent_color).toBe("blue");

  });


  test("a made-up color is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AccentInvalid");

    const res = await request(app)
      .put("/api/business")
      .set("Authorization", authHeader)
      .send({ name: "AccentInvalid Business", accent_color: "chartreuse" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/accent_color must be one of/);

  });


  // "orange" is the default palette's own name, not a distinct real
  // color choice - selecting it is how the picker resets back to no
  // preference at all, so it should store the same as never having set
  // one, not a literal "orange" string the CSS side has no rule for.
  test("choosing \"orange\" clears it back to null, same as never setting one", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AccentOrange");

    await request(app)
      .put("/api/business")
      .set("Authorization", authHeader)
      .send({ name: "AccentOrange Business", accent_color: "violet" });

    await request(app)
      .put("/api/business")
      .set("Authorization", authHeader)
      .send({ name: "AccentOrange Business", accent_color: "orange" });

    const res = await request(app)
      .get("/api/business")
      .set("Authorization", authHeader);

    expect(res.body[0].accent_color).toBeNull();

  });


  // The exact same real bug shape time_tracking_enabled already guards
  // against (see timeTracking.test.js) - an update to some OTHER field
  // that doesn't mention accent_color at all must never reset a
  // business's chosen color back to default. COALESCE alone can't do
  // this for a column whose real "unset" value (NULL) is also a real,
  // legitimately-choosable value - this is the case that would silently
  // break if a future edit swapped the CASE/WHEN in businessController.js
  // for a plain COALESCE.
  test("an update that omits accent_color entirely leaves it exactly as it was", async () => {

    const { authHeader } = await createBusinessAndUser(app, "AccentPreserve");

    await request(app)
      .put("/api/business")
      .set("Authorization", authHeader)
      .send({ name: "AccentPreserve Business", accent_color: "teal" });

    await request(app)
      .put("/api/business")
      .set("Authorization", authHeader)
      .send({ name: "AccentPreserve Business", phone: "555-0177" });

    const res = await request(app)
      .get("/api/business")
      .set("Authorization", authHeader);

    expect(res.body[0].accent_color).toBe("teal");
    expect(res.body[0].phone).toBe("555-0177");

  });

});
