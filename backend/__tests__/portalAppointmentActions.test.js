const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");


const getSlug = async (authHeader) => {

  const res = await request(app)
    .get("/api/business")
    .set("Authorization", authHeader);

  return res.body[0].slug;

};


// X-Test-Client-Id (inert outside the test suite - see rateLimiter.js)
// gives each test's own simulated customer an independent rate-limit
// bucket on the shared per-file server, instead of every test in the
// file colliding on one bucket keyed by the loopback IP they all
// actually share.
const loginAsCustomer = async (slug, email) => {

  await request(app)
    .post(`/api/portal/${slug}/login`)
    .set("X-Test-Client-Id", email)
    .send({ email });

  const lastCall = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
  const body = JSON.parse(lastCall[1].body);
  const token = body.html.match(/token=([a-f0-9]+)/)[1];

  const verify = await request(app)
    .post(`/api/portal/${slug}/verify`)
    .set("X-Test-Client-Id", email)
    .send({ token });

  return `Bearer ${verify.body.token}`;

};


const createCustomer = async (authHeader, name, email) => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name, email });

  return res.body.id;

};


// Owner-side creation defaults to status "scheduled" - the confirmed
// state a customer-initiated reschedule is expected to downgrade out of.
const createScheduledAppointment = async (authHeader, customerId, start_time) => {

  const res = await request(app)
    .post("/api/appointments")
    .set("Authorization", authHeader)
    .send({
      customer_id: customerId,
      title: "Roof inspection",
      start_time,
      end_time: new Date(new Date(start_time).getTime() + 60 * 60 * 1000).toISOString()
    });

  return res.body.id;

};


const FUTURE_TIME = "2027-01-15T15:00:00.000Z";


describe("Customer-initiated appointment cancel/reschedule from the portal", () => {

  test("cancelling a scheduled appointment marks it cancelled and notifies the owner", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PortalCancelSuccess");
    const slug = await getSlug(authHeader);
    const customerId = await createCustomer(authHeader, "Cancel Customer", "portalcancel@test.com");
    const appointmentId = await createScheduledAppointment(authHeader, customerId, FUTURE_TIME);

    const customerAuthHeader = await loginAsCustomer(slug, "portalcancel@test.com");

    const cancelRes = await request(app)
      .post(`/api/portal/account/appointments/${appointmentId}/cancel`)
      .set("Authorization", customerAuthHeader);

    expect(cancelRes.status).toBe(200);

    const fetched = await request(app)
      .get(`/api/appointments/customer/${customerId}`)
      .set("Authorization", authHeader);

    expect(fetched.body.find((a) => a.id === appointmentId).status).toBe("cancelled");

    const notifications = await request(app)
      .get("/api/notifications")
      .set("Authorization", authHeader);

    const cancelNotification = notifications.body.find((n) => n.type === "appointment_cancelled");

    expect(cancelNotification).toBeTruthy();
    expect(cancelNotification.title).toContain("Cancel Customer");


    // Cancelling it again must be refused, not silently accepted twice.
    const secondCancel = await request(app)
      .post(`/api/portal/account/appointments/${appointmentId}/cancel`)
      .set("Authorization", customerAuthHeader);

    expect(secondCancel.status).toBe(400);

  });


  test("a customer can't cancel or reschedule another customer's appointment", async () => {

    const bizA = await createBusinessAndUser(app, "PortalCancelIsolationA");
    const slugA = await getSlug(bizA.authHeader);

    const ownerCustomerId = await createCustomer(bizA.authHeader, "Owner Side Customer", "ownerside@test.com");
    const otherCustomerId = await createCustomer(bizA.authHeader, "Other Customer", "otherside@test.com");

    const appointmentId = await createScheduledAppointment(bizA.authHeader, ownerCustomerId, FUTURE_TIME);

    // Logged in as a DIFFERENT customer of the SAME business - the
    // ownership check must be per-customer, not just per-business.
    const otherCustomerAuthHeader = await loginAsCustomer(slugA, "otherside@test.com");

    const crossCancel = await request(app)
      .post(`/api/portal/account/appointments/${appointmentId}/cancel`)
      .set("Authorization", otherCustomerAuthHeader);

    expect(crossCancel.status).toBe(404);

    const crossReschedule = await request(app)
      .post(`/api/portal/account/appointments/${appointmentId}/reschedule`)
      .set("Authorization", otherCustomerAuthHeader)
      .send({ start_time: "2027-01-20T15:00:00.000Z" });

    expect(crossReschedule.status).toBe(404);

  });


  test("rescheduling a confirmed appointment moves it and flips it back to 'requested' for the owner to re-confirm", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PortalRescheduleFlip");
    const slug = await getSlug(authHeader);
    const customerId = await createCustomer(authHeader, "Reschedule Customer", "portalreschedule@test.com");

    // 90-minute appointment - reschedule must preserve that duration.
    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        title: "Roof inspection",
        start_time: FUTURE_TIME,
        end_time: "2027-01-15T16:30:00.000Z"
      });

    const customerAuthHeader = await loginAsCustomer(slug, "portalreschedule@test.com");

    const newTime = "2027-01-18T15:00:00.000Z";

    const rescheduleRes = await request(app)
      .post(`/api/portal/account/appointments/${created.body.id}/reschedule`)
      .set("Authorization", customerAuthHeader)
      .send({ start_time: newTime });

    expect(rescheduleRes.status).toBe(200);

    const fetched = await request(app)
      .get(`/api/appointments/customer/${customerId}`)
      .set("Authorization", authHeader);

    const appt = fetched.body.find((a) => a.id === created.body.id);

    expect(appt.start_time).toBe(newTime);
    // 90 minutes preserved on the new day.
    expect(appt.end_time).toBe("2027-01-18T16:30:00.000Z");
    expect(appt.status).toBe("requested");

    const notifications = await request(app)
      .get("/api/notifications")
      .set("Authorization", authHeader);

    expect(notifications.body.find((n) => n.type === "appointment_reschedule_requested")).toBeTruthy();

  });


  test("rescheduling an already-'requested' appointment keeps it 'requested', and a past appointment can't be touched", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PortalRescheduleRequested");
    const slug = await getSlug(authHeader);
    const customerId = await createCustomer(authHeader, "Requested Customer", "portalrequested@test.com");

    const customerAuthHeader = await loginAsCustomer(slug, "portalrequested@test.com");

    // The customer's own request flow - starts life as "requested",
    // never "scheduled".
    const requested = await request(app)
      .post("/api/portal/account/appointments")
      .set("Authorization", customerAuthHeader)
      .send({ title: "New estimate", start_time: FUTURE_TIME });

    const rescheduleRes = await request(app)
      .post(`/api/portal/account/appointments/${requested.body.id}/reschedule`)
      .set("Authorization", customerAuthHeader)
      .send({ start_time: "2027-01-20T15:00:00.000Z" });

    expect(rescheduleRes.status).toBe(200);

    const fetched = await request(app)
      .get(`/api/appointments/customer/${customerId}`)
      .set("Authorization", authHeader);

    // Already "requested" before, still "requested" after - nothing to
    // downgrade, and definitely never silently promoted to "scheduled".
    expect(fetched.body.find((a) => a.id === requested.body.id).status).toBe("requested");


    // A past appointment, on the same account - neither action should
    // be allowed once the time has already gone by.
    const pastAppointmentId = await createScheduledAppointment(authHeader, customerId, "2020-01-01T10:00:00.000Z");

    const cancelPast = await request(app)
      .post(`/api/portal/account/appointments/${pastAppointmentId}/cancel`)
      .set("Authorization", customerAuthHeader);

    expect(cancelPast.status).toBe(400);

    const reschedulePast = await request(app)
      .post(`/api/portal/account/appointments/${pastAppointmentId}/reschedule`)
      .set("Authorization", customerAuthHeader)
      .send({ start_time: FUTURE_TIME });

    expect(reschedulePast.status).toBe(400);

  });

});
