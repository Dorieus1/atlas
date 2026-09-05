const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");


// Same reference dates businessHours.test.js already established and
// verified: 2026-09-14 is a Monday, 2026-09-12 is the Saturday right
// before it.
const WEEKDAY_HOURS = {
  mon: { open: "09:00", close: "17:00" },
  tue: { open: "09:00", close: "17:00" },
  wed: { open: "09:00", close: "17:00" },
  thu: { open: "09:00", close: "17:00" },
  fri: { open: "09:00", close: "17:00" },
  sat: null,
  sun: null
};


const setBusinessHours = async (authHeader, businessName, businessHours, timezone) => {

  return request(app)
    .put("/api/business")
    .set("Authorization", authHeader)
    .send({ name: businessName, business_hours: businessHours, timezone });

};


const getSlug = async (authHeader) => {

  const res = await request(app)
    .get("/api/business")
    .set("Authorization", authHeader);

  return res.body[0].slug;

};


describe("Public self-service booking", () => {

  describe("GET /api/public/:slug/availability", () => {

    test("a business with no hours configured reports bookingEnabled: false", async () => {

      const { authHeader } = await createBusinessAndUser(app, "AvailNoHours");
      const slug = await getSlug(authHeader);

      const res = await request(app).get(`/api/public/${slug}/availability`);

      expect(res.status).toBe(200);
      expect(res.body.bookingEnabled).toBe(false);
      expect(res.body.days).toEqual([]);

    });


    test("an unknown slug 404s", async () => {

      const res = await request(app).get(`/api/public/does-not-exist-at-all/availability`);

      expect(res.status).toBe(404);

    });


    test("a configured business returns real slots on open days and none on closed days", async () => {

      const { authHeader } = await createBusinessAndUser(app, "AvailBasic");
      const slug = await getSlug(authHeader);

      await setBusinessHours(authHeader, "AvailBasic Business", WEEKDAY_HOURS, "UTC");

      const res = await request(app)
        .get(`/api/public/${slug}/availability`)
        .query({ start_date: "2026-09-12", days: 3 }); // Sat, Sun, Mon

      expect(res.status).toBe(200);
      expect(res.body.bookingEnabled).toBe(true);
      expect(res.body.days).toHaveLength(3);

      const [sat, sun, mon] = res.body.days;

      expect(sat.date).toBe("2026-09-12");
      expect(sat.slots).toHaveLength(0);

      expect(sun.date).toBe("2026-09-13");
      expect(sun.slots).toHaveLength(0);

      // 9:00-17:00, 60min default duration, 30min grid -> last bookable
      // start is 16:00 (16:00 + 60min = 17:00 = close). 9:00 to 16:00
      // every 30 min inclusive = 15 slots.
      expect(mon.date).toBe("2026-09-14");
      expect(mon.slots).toHaveLength(15);
      expect(mon.slots[0]).toBe("2026-09-14T09:00:00.000Z");
      expect(mon.slots[mon.slots.length - 1]).toBe("2026-09-14T16:00:00.000Z");

    });


    test("an existing appointment removes the slots it overlaps, and a longer duration removes more of them", async () => {

      const { authHeader } = await createBusinessAndUser(app, "AvailConflict");
      const slug = await getSlug(authHeader);

      await setBusinessHours(authHeader, "AvailConflict Business", WEEKDAY_HOURS, "UTC");

      // A 9:30-10:30 appointment already on the books.
      await request(app)
        .post("/api/appointments")
        .set("Authorization", authHeader)
        .send({ title: "Existing job", start_time: "2026-09-14T09:30:00.000Z", end_time: "2026-09-14T10:30:00.000Z" });

      const res = await request(app)
        .get(`/api/public/${slug}/availability`)
        .query({ start_date: "2026-09-14", days: 1 });

      const slots = res.body.days[0].slots;

      // 9:00 (9:00-10:00) overlaps the 9:30 start -> excluded.
      // 9:30, 10:00 (10:00-11:00 overlaps 10:00-10:30 portion) -> excluded.
      // 10:30 (10:30-11:30) does not overlap [9:30,10:30) -> included.
      expect(slots).not.toContain("2026-09-14T09:00:00.000Z");
      expect(slots).not.toContain("2026-09-14T09:30:00.000Z");
      expect(slots).not.toContain("2026-09-14T10:00:00.000Z");
      expect(slots).toContain("2026-09-14T10:30:00.000Z");

    });


    test("slots less than an hour from now are never offered, even on an otherwise wide-open day", async () => {

      const { authHeader } = await createBusinessAndUser(app, "AvailMinNotice");
      const slug = await getSlug(authHeader);

      await setBusinessHours(authHeader, "AvailMinNotice Business", {
        sun: { open: "00:00", close: "23:59" },
        mon: { open: "00:00", close: "23:59" },
        tue: { open: "00:00", close: "23:59" },
        wed: { open: "00:00", close: "23:59" },
        thu: { open: "00:00", close: "23:59" },
        fri: { open: "00:00", close: "23:59" },
        sat: { open: "00:00", close: "23:59" }
      }, "UTC");

      const res = await request(app).get(`/api/public/${slug}/availability`);

      const today = res.body.days[0];
      const earliestAllowed = Date.now() + 59 * 60 * 1000;

      today.slots.forEach((iso) => {
        expect(new Date(iso).getTime()).toBeGreaterThanOrEqual(earliestAllowed);
      });

    });

  });


  describe("POST /api/public/:slug/book", () => {

    const bookableBusiness = async (prefix) => {

      const { authHeader } = await createBusinessAndUser(app, prefix);
      const slug = await getSlug(authHeader);

      await setBusinessHours(authHeader, `${prefix} Business`, WEEKDAY_HOURS, "UTC");

      return { authHeader, slug };

    };


    test("a missing name or invalid time is rejected", async () => {

      const { slug } = await bookableBusiness("BookValidation");

      const noName = await request(app)
        .post(`/api/public/${slug}/book`)
        .send({ start_time: "2026-09-14T10:00:00.000Z" });

      expect(noName.status).toBe(400);

      const badTime = await request(app)
        .post(`/api/public/${slug}/book`)
        .send({ name: "Jane Doe", start_time: "not-a-real-date" });

      expect(badTime.status).toBe(400);

    });


    test("booking a business with no hours configured is refused", async () => {

      const { authHeader } = await createBusinessAndUser(app, "BookNoHours");
      const slug = await getSlug(authHeader);

      const res = await request(app)
        .post(`/api/public/${slug}/book`)
        .send({ name: "Jane Doe", start_time: "2026-09-14T10:00:00.000Z" });

      expect(res.status).toBe(400);

    });


    test("a real open slot can be booked, creating a customer and a 'requested' appointment", async () => {

      const { authHeader, slug } = await bookableBusiness("BookHappyPath");

      const res = await request(app)
        .post(`/api/public/${slug}/book`)
        .send({
          name: "Jane Doe",
          email: "janedoe@test.com",
          phone: "555-0100",
          start_time: "2026-09-14T10:00:00.000Z",
          title: "Estimate",
          notes: "Front door squeaks"
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();

      const appt = await request(app)
        .get("/api/appointments")
        .set("Authorization", authHeader);

      const created = appt.body.find((a) => a.id === res.body.id);

      expect(created.status).toBe("requested");
      expect(created.title).toBe("Estimate");
      expect(created.customer_name).toBe("Jane Doe");

      const notifications = await request(app)
        .get("/api/notifications")
        .set("Authorization", authHeader);

      expect(notifications.body.some((n) => n.type === "appointment_requested")).toBe(true);

    });


    // Regression test for a real, user-confirmed fix (2026-09-05): this
    // used to create a brand-new customer on every single booking, even
    // for the exact same real person booking a second time - their
    // history ended up split across disconnected records unless the
    // owner noticed and manually merged them.
    test("a returning customer (matched by email) reuses their existing record instead of creating a new one", async () => {

      const { authHeader, slug } = await bookableBusiness("BookReturning");

      // Independent rate-limit bucket (see rateLimiter.js) so this test's
      // own two bookings don't eat into the shared-IP bucket every other
      // test in this file draws from.
      const first = await request(app)
        .post(`/api/public/${slug}/book`)
        .set("X-Test-Client-Id", "book-returning-email")
        .send({ name: "Jane Doe", email: "jane@test.com", start_time: "2026-09-14T10:00:00.000Z" });

      expect(first.status).toBe(201);

      const second = await request(app)
        .post(`/api/public/${slug}/book`)
        .set("X-Test-Client-Id", "book-returning-email")
        .send({ name: "Jane Doe", email: "jane@test.com", start_time: "2026-09-14T13:00:00.000Z" });

      expect(second.status).toBe(201);

      const appts = await request(app)
        .get("/api/appointments")
        .set("Authorization", authHeader);

      const firstAppt = appts.body.find((a) => a.id === first.body.id);
      const secondAppt = appts.body.find((a) => a.id === second.body.id);

      expect(secondAppt.customer_id).toBe(firstAppt.customer_id);

      const customers = await request(app)
        .get("/api/customers")
        .set("Authorization", authHeader);

      expect(customers.body.filter((c) => c.email === "jane@test.com")).toHaveLength(1);

    });


    // Phone matching has to survive real-world formatting differences -
    // a customer rarely types their number the exact same way twice.
    test("a returning customer matched by phone works even when the formatting differs between visits", async () => {

      const { authHeader, slug } = await bookableBusiness("BookReturningPhone");

      const first = await request(app)
        .post(`/api/public/${slug}/book`)
        .set("X-Test-Client-Id", "book-returning-phone")
        .send({ name: "John Smith", phone: "(555) 123-4567", start_time: "2026-09-14T10:00:00.000Z" });

      const second = await request(app)
        .post(`/api/public/${slug}/book`)
        .set("X-Test-Client-Id", "book-returning-phone")
        .send({ name: "John Smith", phone: "555-123-4567", start_time: "2026-09-14T13:00:00.000Z" });

      const appts = await request(app)
        .get("/api/appointments")
        .set("Authorization", authHeader);

      const firstAppt = appts.body.find((a) => a.id === first.body.id);
      const secondAppt = appts.body.find((a) => a.id === second.body.id);

      expect(secondAppt.customer_id).toBe(firstAppt.customer_id);

    });


    test("a blank title falls back to a sensible default", async () => {

      const { authHeader, slug } = await bookableBusiness("BookNoTitle");

      const res = await request(app)
        .post(`/api/public/${slug}/book`)
        .send({ name: "Jane Doe", start_time: "2026-09-14T10:00:00.000Z" });

      const appt = await request(app)
        .get("/api/appointments")
        .set("Authorization", authHeader);

      const created = appt.body.find((a) => a.id === res.body.id);

      expect(created.title).toBe("Appointment request");

    });


    test("a slot outside business hours is refused even if the client claims it's free", async () => {

      const { slug } = await bookableBusiness("BookOutsideHours");

      // 3am Monday - well outside 9-5.
      const res = await request(app)
        .post(`/api/public/${slug}/book`)
        .send({ name: "Jane Doe", start_time: "2026-09-14T03:00:00.000Z" });

      expect(res.status).toBe(409);

    });


    // Sequential double-booking (await one, then the other) is
    // deliberately not tested as its own separate case - the truly
    // concurrent version right below is a strict superset of it (if two
    // requests racing at the exact same instant can only ever let one
    // through, two requests arriving one after another can't possibly
    // do worse), and every call to this endpoint spends real budget
    // against its own per-IP rate limit (10/60s, shared across every
    // test in this file) - not worth spending twice on the weaker of
    // two versions of the same check.
    //
    // Regression test for a real race a peer review caught: a plain
    // separate "check availability, then insert" (no lock between the
    // two steps) let two visitors clicking "Book" on the same popular
    // slot within the same second - completely ordinary, not an attack -
    // both pass the availability check before either write had landed,
    // producing a genuine double-booking with no error to either side.
    // A purely sequential test (await one booking, then the other)
    // would have passed even before the fix, since the second request's
    // own check would run after the first had already committed - only
    // firing both at once with Promise.all actually exercises the race.
    test("two truly concurrent bookings for the same slot don't both win", async () => {

      const { authHeader, slug } = await bookableBusiness("BookConcurrent");

      const [first, second] = await Promise.all([

        request(app)
          .post(`/api/public/${slug}/book`)
          .send({ name: "Visitor A", start_time: "2026-09-14T10:00:00.000Z" }),

        request(app)
          .post(`/api/public/${slug}/book`)
          .send({ name: "Visitor B", start_time: "2026-09-14T10:00:00.000Z" })

      ]);

      const statuses = [first.status, second.status].sort();

      // Exactly one wins (201) and exactly one loses (409) - never both
      // succeeding (a real double-booking) and never both failing (the
      // slot never actually getting booked at all).
      expect(statuses).toEqual([201, 409]);

      const appts = await request(app)
        .get("/api/appointments")
        .set("Authorization", authHeader);

      const atThatTime = appts.body.filter((a) => a.start_time === "2026-09-14T10:00:00.000Z");

      expect(atThatTime).toHaveLength(1);

    });


    test("an unknown slug 404s", async () => {

      const res = await request(app)
        .post(`/api/public/does-not-exist-at-all/book`)
        .send({ name: "Jane Doe", start_time: "2026-09-14T10:00:00.000Z" });

      expect(res.status).toBe(404);

    });

  });

});
