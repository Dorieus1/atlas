const request = require("supertest");
const app = require("../server");
const db = require("../../database/db");
const { createBusinessAndUser } = require("./setup/helpers");
const { purgeOldTrashedCustomers } = require("../services/customerPurgeService");


const createCustomer = async (authHeader, name, email) => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name, email });

  return res.body.id;

};


const runAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {

    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });

  });

};


const getAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {

    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));

  });

};


const allAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {

    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));

  });

};


// Directly backdates deleted_at, since the DELETE endpoint always stamps
// "now" and the purge job cares about how long ago that was - same
// approach backend/__tests__/invoiceReminders.test.js uses for sent_at.
const backdateDeletedAt = (customerId, daysAgo) => {

  return runAsync(
    "UPDATE customers SET deleted_at = ? WHERE id = ?",
    [new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(), customerId]
  );

};


describe("Customer trash", () => {

  test("deleting a customer sets deleted_at instead of removing the row, and leaves related rows alone", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TrashSetsDeletedAt");
    const customerId = await createCustomer(authHeader, "Trash Customer", "trash1@test.com");

    await request(app)
      .post("/api/notes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, note: "a note" });

    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, title: "a job", start_time: "2026-09-01T10:00:00.000Z" });

    const del = await request(app)
      .delete(`/api/customers/${customerId}`)
      .set("Authorization", authHeader);

    expect(del.status).toBe(200);

    const row = await getAsync("SELECT * FROM customers WHERE id = ?", [customerId]);

    expect(row).toBeTruthy();
    expect(row.deleted_at).toBeTruthy();

    const notes = await allAsync("SELECT * FROM notes WHERE customer_id = ?", [customerId]);
    const appointments = await allAsync("SELECT * FROM appointments WHERE customer_id = ?", [customerId]);

    expect(notes).toHaveLength(1);
    expect(appointments).toHaveLength(1);

  });


  test("a soft-deleted customer no longer appears in the normal list endpoint", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TrashHiddenFromList");
    const keepId = await createCustomer(authHeader, "Keep Customer", "keep@test.com");
    const trashId = await createCustomer(authHeader, "Trash Customer", "trash2@test.com");

    await request(app)
      .delete(`/api/customers/${trashId}`)
      .set("Authorization", authHeader);

    const list = await request(app)
      .get("/api/customers")
      .set("Authorization", authHeader);

    const ids = list.body.map((c) => c.id);

    expect(ids).toContain(keepId);
    expect(ids).not.toContain(trashId);

  });


  test("restoring a trashed customer clears deleted_at and makes it reappear in the normal list", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TrashRestore");
    const customerId = await createCustomer(authHeader, "Restore Customer", "restore@test.com");

    await request(app)
      .delete(`/api/customers/${customerId}`)
      .set("Authorization", authHeader);

    const restore = await request(app)
      .post(`/api/customers/${customerId}/restore`)
      .set("Authorization", authHeader);

    expect(restore.status).toBe(200);

    const row = await getAsync("SELECT deleted_at FROM customers WHERE id = ?", [customerId]);
    expect(row.deleted_at).toBeFalsy();

    const list = await request(app)
      .get("/api/customers")
      .set("Authorization", authHeader);

    expect(list.body.map((c) => c.id)).toContain(customerId);

  });


  test("restoring a customer that was never trashed returns 404", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TrashRestoreNotTrashed");
    const customerId = await createCustomer(authHeader, "Active Customer", "active@test.com");

    const restore = await request(app)
      .post(`/api/customers/${customerId}/restore`)
      .set("Authorization", authHeader);

    expect(restore.status).toBe(404);

  });


  test("restoring a customer that doesn't exist returns 404", async () => {

    const { authHeader } = await createBusinessAndUser(app, "TrashRestoreMissing");

    const restore = await request(app)
      .post("/api/customers/00000000-0000-0000-0000-000000000000/restore")
      .set("Authorization", authHeader);

    expect(restore.status).toBe(404);

  });


  test("restoring another business's trashed customer returns 404", async () => {

    const bizA = await createBusinessAndUser(app, "TrashRestoreCrossA");
    const bizB = await createBusinessAndUser(app, "TrashRestoreCrossB");

    const customerId = await createCustomer(bizA.authHeader, "Cross Customer", "cross@test.com");

    await request(app)
      .delete(`/api/customers/${customerId}`)
      .set("Authorization", bizA.authHeader);

    const restore = await request(app)
      .post(`/api/customers/${customerId}/restore`)
      .set("Authorization", bizB.authHeader);

    expect(restore.status).toBe(404);

    // and it's still trashed for its real owner
    const row = await getAsync("SELECT deleted_at FROM customers WHERE id = ?", [customerId]);
    expect(row.deleted_at).toBeTruthy();

  });


  test("the trash-list endpoint returns only this business's trashed customers, most-recently-deleted first", async () => {

    const bizA = await createBusinessAndUser(app, "TrashListScopedA");
    const bizB = await createBusinessAndUser(app, "TrashListScopedB");

    const activeA = await createCustomer(bizA.authHeader, "Active A", "activea@test.com");
    const trashedA1 = await createCustomer(bizA.authHeader, "Trashed A1", "trasheda1@test.com");
    const trashedA2 = await createCustomer(bizA.authHeader, "Trashed A2", "trasheda2@test.com");
    const trashedB = await createCustomer(bizB.authHeader, "Trashed B", "trashedb@test.com");

    await request(app).delete(`/api/customers/${trashedA1}`).set("Authorization", bizA.authHeader);

    // make sure A2 gets a strictly later deleted_at than A1
    await backdateDeletedAt(trashedA1, 2);

    await request(app).delete(`/api/customers/${trashedA2}`).set("Authorization", bizA.authHeader);
    await request(app).delete(`/api/customers/${trashedB}`).set("Authorization", bizB.authHeader);

    const trashList = await request(app)
      .get("/api/customers/trash")
      .set("Authorization", bizA.authHeader);

    expect(trashList.status).toBe(200);

    const ids = trashList.body.map((c) => c.id);

    expect(ids).toEqual([trashedA2, trashedA1]);
    expect(ids).not.toContain(activeA);
    expect(ids).not.toContain(trashedB);

  });


  test("purgeOldTrashedCustomers permanently removes a customer trashed 31+ days ago, cascading to related rows", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PurgeOld");
    const customerId = await createCustomer(authHeader, "Old Trash Customer", "oldtrash@test.com");

    await request(app)
      .post("/api/notes")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, note: "should be purged" });

    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ customer_id: customerId, title: "should be purged", start_time: "2026-09-01T10:00:00.000Z" });

    const quoteRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", authHeader)
      .send({
        customer_id: customerId,
        items: [{ description: "Job", quantity: 1, unit_price: 100 }]
      });

    await request(app)
      .post(`/api/quotes/${quoteRes.body.id}/expenses`)
      .set("Authorization", authHeader)
      .send({ description: "Materials", amount: 40 });

    await request(app)
      .delete(`/api/customers/${customerId}`)
      .set("Authorization", authHeader);

    await backdateDeletedAt(customerId, 31);

    const purgedCount = await purgeOldTrashedCustomers();

    expect(purgedCount).toBeGreaterThanOrEqual(1);

    const customerRow = await getAsync("SELECT * FROM customers WHERE id = ?", [customerId]);
    expect(customerRow).toBeUndefined();

    const notes = await allAsync("SELECT * FROM notes WHERE customer_id = ?", [customerId]);
    const appointments = await allAsync("SELECT * FROM appointments WHERE customer_id = ?", [customerId]);
    const quotes = await allAsync("SELECT * FROM quotes WHERE customer_id = ?", [customerId]);
    const quoteItems = await allAsync(
      "SELECT * FROM quote_items WHERE quote_id IN (SELECT id FROM quotes WHERE customer_id = ?)",
      [customerId]
    );
    const quoteExpenses = await allAsync(
      "SELECT * FROM quote_expenses WHERE quote_id = ?",
      [quoteRes.body.id]
    );

    expect(notes).toHaveLength(0);
    expect(appointments).toHaveLength(0);
    expect(quotes).toHaveLength(0);
    expect(quoteItems).toHaveLength(0);
    expect(quoteExpenses).toHaveLength(0);

  });


  test("purgeOldTrashedCustomers leaves a customer trashed only 5 days ago untouched", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PurgeRecent");
    const customerId = await createCustomer(authHeader, "Recent Trash Customer", "recenttrash@test.com");

    await request(app)
      .delete(`/api/customers/${customerId}`)
      .set("Authorization", authHeader);

    await backdateDeletedAt(customerId, 5);

    await purgeOldTrashedCustomers();

    const customerRow = await getAsync("SELECT * FROM customers WHERE id = ?", [customerId]);

    expect(customerRow).toBeTruthy();
    expect(customerRow.deleted_at).toBeTruthy();

  });


  test("purging is best-effort - a failure on one customer doesn't stop the rest of the batch from being purged", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PurgeBestEffort");

    const failingId = await createCustomer(authHeader, "Failing Customer", "failing@test.com");
    const healthyId = await createCustomer(authHeader, "Healthy Customer", "healthy@test.com");

    await request(app).delete(`/api/customers/${failingId}`).set("Authorization", authHeader);
    await request(app).delete(`/api/customers/${healthyId}`).set("Authorization", authHeader);

    await backdateDeletedAt(failingId, 31);
    await backdateDeletedAt(healthyId, 31);

    // Force one customer's purge to blow up partway through its cascade,
    // simulating a bad row/constraint issue on just that customer, without
    // touching how the rest of the batch is processed.
    const originalRun = db.run.bind(db);

    const runSpy = jest.spyOn(db, "run").mockImplementation(function (sql, params, callback) {

      if (
        typeof sql === "string" &&
        sql.includes("DELETE FROM notes") &&
        Array.isArray(params) &&
        params[0] === failingId
      ) {

        return callback(new Error("simulated purge failure"));

      }

      return originalRun(sql, params, callback);

    });

    try {

      const purgedCount = await purgeOldTrashedCustomers();

      expect(purgedCount).toBe(1);

    } finally {

      runSpy.mockRestore();

    }

    const failingRow = await getAsync("SELECT * FROM customers WHERE id = ?", [failingId]);
    const healthyRow = await getAsync("SELECT * FROM customers WHERE id = ?", [healthyId]);

    // the healthy customer got purged despite the other one's failure...
    expect(healthyRow).toBeUndefined();

    // ...and the failing one is still sitting in the trash, untouched,
    // ready to be retried on the next run.
    expect(failingRow).toBeTruthy();
    expect(failingRow.deleted_at).toBeTruthy();

  });

});
