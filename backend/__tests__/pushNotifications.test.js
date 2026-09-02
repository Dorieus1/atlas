const request = require("supertest");
const app = require("../server");
const db = require("../../database/db");
const { createBusinessAndUser } = require("./setup/helpers");


// createNotification (notificationService.js) fires the push fan-out
// without awaiting it, so it can never delay the response the caller is
// actually waiting on - which means, just like the detached lead
// detection covered in notifications.test.js, there's a real (tiny) gap
// between "the HTTP response came back" and "the push attempt actually
// happened". There's no flush hook for this one (it's a much shorter
// chain than chat's), so a short wait stands in for it, the same way
// appleCalendar.test.js already does for its own detached work.
const waitForPush = () => new Promise((resolve) => setTimeout(resolve, 50));

const subscriptionCount = (endpoint) => new Promise((resolve, reject) => {
  db.get(
    "SELECT COUNT(*) AS count FROM push_subscriptions WHERE endpoint = ?",
    [endpoint],
    (err, row) => (err ? reject(err) : resolve(row.count))
  );
});

const fakeSubscription = (endpoint) => ({
  endpoint,
  keys: { p256dh: "test-p256dh-key", auth: "test-auth-secret" }
});


describe("Push notifications", () => {

  beforeEach(() => {
    global.__mockWebPush.sendNotification.mockReset();
    global.__mockWebPush.sendNotification.mockResolvedValue({ statusCode: 201 });
  });


  test("the public VAPID key is exposed to authenticated users", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PushPublicKey");

    const res = await request(app)
      .get("/api/push/public-key")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body.publicKey).toBe(process.env.VAPID_PUBLIC_KEY);

  });


  test("subscribing without a valid subscription body is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PushBadSub");

    const missingKeys = await request(app)
      .post("/api/push/subscribe")
      .set("Authorization", authHeader)
      .send({ subscription: { endpoint: "https://push.example/missing-keys" } });

    expect(missingKeys.status).toBe(400);

    const missingBody = await request(app)
      .post("/api/push/subscribe")
      .set("Authorization", authHeader)
      .send({});

    expect(missingBody.status).toBe(400);

  });


  test("subscribing twice with the same endpoint updates the one row instead of duplicating it", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PushResubscribe");
    const endpoint = "https://push.example/resubscribe-endpoint";

    const first = await request(app)
      .post("/api/push/subscribe")
      .set("Authorization", authHeader)
      .send({ subscription: fakeSubscription(endpoint) });

    expect(first.status).toBe(200);

    // Same endpoint, different keys - simulates a device whose keys
    // rotated and re-subscribed, the real-world case this upsert exists for.
    const second = await request(app)
      .post("/api/push/subscribe")
      .set("Authorization", authHeader)
      .send({
        subscription: {
          endpoint,
          keys: { p256dh: "rotated-p256dh", auth: "rotated-auth" }
        }
      });

    expect(second.status).toBe(200);
    expect(await subscriptionCount(endpoint)).toBe(1);

  });


  test("unsubscribing removes the subscription", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PushUnsubscribe");
    const endpoint = "https://push.example/unsubscribe-endpoint";

    await request(app)
      .post("/api/push/subscribe")
      .set("Authorization", authHeader)
      .send({ subscription: fakeSubscription(endpoint) });

    expect(await subscriptionCount(endpoint)).toBe(1);

    const res = await request(app)
      .post("/api/push/unsubscribe")
      .set("Authorization", authHeader)
      .send({ endpoint });

    expect(res.status).toBe(200);
    expect(await subscriptionCount(endpoint)).toBe(0);

  });


  test("one business cannot unsubscribe another business's device", async () => {

    const bizA = await createBusinessAndUser(app, "PushCrossUnsubA");
    const bizB = await createBusinessAndUser(app, "PushCrossUnsubB");

    const endpoint = "https://push.example/cross-tenant-device";

    // bizA's device is subscribed.
    await request(app)
      .post("/api/push/subscribe")
      .set("Authorization", bizA.authHeader)
      .send({ subscription: fakeSubscription(endpoint) });

    expect(await subscriptionCount(endpoint)).toBe(1);

    // bizB knows the endpoint string and tries to kill it. The endpoint
    // is a globally unique key, so without an ownership check this would
    // silently delete bizA's row.
    const res = await request(app)
      .post("/api/push/unsubscribe")
      .set("Authorization", bizB.authHeader)
      .send({ endpoint });

    expect(res.status).toBe(200);
    expect(await subscriptionCount(endpoint)).toBe(1);

    // bizA can still unsubscribe its own device.
    await request(app)
      .post("/api/push/unsubscribe")
      .set("Authorization", bizA.authHeader)
      .send({ endpoint });

    expect(await subscriptionCount(endpoint)).toBe(0);

  });


  test("unsubscribing an endpoint that was never subscribed doesn't error", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PushUnknownUnsub");

    const res = await request(app)
      .post("/api/push/unsubscribe")
      .set("Authorization", authHeader)
      .send({ endpoint: "https://push.example/never-existed" });

    expect(res.status).toBe(200);

  });


  test("a new notification pushes to every device subscribed for that business", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "PushFanOut");
    const endpointOne = "https://push.example/fanout-device-one";
    const endpointTwo = "https://push.example/fanout-device-two";

    await request(app)
      .post("/api/push/subscribe")
      .set("Authorization", authHeader)
      .send({ subscription: fakeSubscription(endpointOne) });

    await request(app)
      .post("/api/push/subscribe")
      .set("Authorization", authHeader)
      .send({ subscription: fakeSubscription(endpointTwo) });

    const slug = await new Promise((resolve, reject) => {
      db.get(
        "SELECT slug FROM businesses WHERE id = ?",
        [business_id],
        (err, row) => (err ? reject(err) : resolve(row.slug))
      );
    });

    // A brand-new public visitor already creates a "new_conversation"
    // notification (see notifications.test.js) - reusing that real path
    // here instead of reaching into notificationService directly keeps
    // this test honest about what actually happens end-to-end.
    await request(app)
      .post(`/api/public/${slug}/start`)
      .send({ name: "Push Test Visitor" });

    await waitForPush();

    expect(global.__mockWebPush.sendNotification).toHaveBeenCalledTimes(2);

    const pushedEndpoints = global.__mockWebPush.sendNotification.mock.calls.map((call) => call[0].endpoint);
    expect(pushedEndpoints.sort()).toEqual([endpointOne, endpointTwo].sort());

    const payload = JSON.parse(global.__mockWebPush.sendNotification.mock.calls[0][1]);
    expect(payload.title).toContain("Push Test Visitor");

  });


  test("a device subscribed on one business is never pushed to for another business's notification", async () => {

    const bizA = await createBusinessAndUser(app, "PushIsolationA");
    const bizB = await createBusinessAndUser(app, "PushIsolationB");

    const endpoint = "https://push.example/isolation-device";

    await request(app)
      .post("/api/push/subscribe")
      .set("Authorization", bizA.authHeader)
      .send({ subscription: fakeSubscription(endpoint) });

    const slugB = await new Promise((resolve, reject) => {
      db.get(
        "SELECT slug FROM businesses WHERE id = ?",
        [bizB.business_id],
        (err, row) => (err ? reject(err) : resolve(row.slug))
      );
    });

    await request(app)
      .post(`/api/public/${slugB}/start`)
      .send({ name: "Isolation Visitor" });

    await waitForPush();

    expect(global.__mockWebPush.sendNotification).not.toHaveBeenCalled();

  });


  test("a 410 Gone response cleans up the dead subscription instead of retrying it forever", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "PushDeadDevice");
    const endpoint = "https://push.example/dead-device";

    await request(app)
      .post("/api/push/subscribe")
      .set("Authorization", authHeader)
      .send({ subscription: fakeSubscription(endpoint) });

    const goneError = new Error("Gone");
    goneError.statusCode = 410;
    global.__mockWebPush.sendNotification.mockRejectedValueOnce(goneError);

    const slug = await new Promise((resolve, reject) => {
      db.get(
        "SELECT slug FROM businesses WHERE id = ?",
        [business_id],
        (err, row) => (err ? reject(err) : resolve(row.slug))
      );
    });

    await request(app)
      .post(`/api/public/${slug}/start`)
      .send({ name: "Dead Device Visitor" });

    await waitForPush();

    expect(await subscriptionCount(endpoint)).toBe(0);

  });


  test("subscribing and unsubscribing both require authentication", async () => {

    const subscribeRes = await request(app)
      .post("/api/push/subscribe")
      .send({ subscription: fakeSubscription("https://push.example/no-auth") });

    expect(subscribeRes.status).toBe(401);

    const unsubscribeRes = await request(app)
      .post("/api/push/unsubscribe")
      .send({ endpoint: "https://push.example/no-auth" });

    expect(unsubscribeRes.status).toBe(401);

  });

});
