const request = require("supertest");
const app = require("../server");
const db = require("../../database/db");
const { createBusinessAndUser } = require("./setup/helpers");
const { INITIAL_OCCURRENCES, RENEWAL_OCCURRENCES } = require("../services/serviceAgreementService");


const runAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });
  });

};


const createCustomer = async (authHeader, name = "Plan Customer") => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name });

  return res.body.id;

};


// The fixture start_date must stay in the future relative to whenever
// the suite runs: visits_remaining / next_visit_at (serviceAgreementService)
// only count occurrences still ahead of `now`, so a hardcoded date would
// silently start dropping occurrences from the count the moment the wall
// clock passed it. A few days out keeps all 12 quarterly occurrences
// (and every renewed one) firmly in the future.
const PLAN_START_DATE = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();


const createPlan = async (authHeader, customer_id, overrides = {}) => {

  return request(app)
    .post("/api/service-agreements")
    .set("Authorization", authHeader)
    .send({
      customer_id,
      title: "Quarterly Pest Control",
      frequency: "quarterly",
      start_date: PLAN_START_DATE,
      price: 120,
      ...overrides
    });

};


describe("Service agreements", () => {

  test("creating a plan generates its first batch of appointments, all tagged with the plan", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PlanCreate");
    const customerId = await createCustomer(authHeader);

    const created = await createPlan(authHeader, customerId);

    expect(created.status).toBe(201);
    expect(created.body.id).toBeTruthy();

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const generated = list.body.filter((a) => a.service_agreement_id === created.body.id);

    expect(generated).toHaveLength(INITIAL_OCCURRENCES);
    expect(generated.every((a) => a.title === "Quarterly Pest Control")).toBe(true);
    expect(generated.every((a) => a.status === "scheduled")).toBe(true);

    // Quarterly = 3 months apart, so the second occurrence should land
    // exactly 3 months after the first.
    const sorted = generated.map((a) => a.start_time).sort();
    const first = new Date(sorted[0]);
    const second = new Date(sorted[1]);
    const monthsApart = (second.getUTCFullYear() - first.getUTCFullYear()) * 12 + (second.getUTCMonth() - first.getUTCMonth());
    expect(monthsApart).toBe(3);

  });


  test("validation: missing customer, missing title, bad frequency, bad start_date, and negative price are all rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PlanValidation");
    const customerId = await createCustomer(authHeader);

    const noCustomer = await createPlan(authHeader, undefined);
    expect(noCustomer.status).toBe(400);

    const unknownCustomer = await createPlan(authHeader, "does-not-exist");
    expect(unknownCustomer.status).toBe(400);

    const noTitle = await createPlan(authHeader, customerId, { title: "   " });
    expect(noTitle.status).toBe(400);

    const badFrequency = await createPlan(authHeader, customerId, { frequency: "daily" });
    expect(badFrequency.status).toBe(400);

    const badStartDate = await createPlan(authHeader, customerId, { start_date: "not-a-date" });
    expect(badStartDate.status).toBe(400);

    const negativePrice = await createPlan(authHeader, customerId, { price: -5 });
    expect(negativePrice.status).toBe(400);

  });


  test("price is optional - a plan with no price still generates appointments fine", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PlanNoPrice");
    const customerId = await createCustomer(authHeader);

    const created = await createPlan(authHeader, customerId, { price: undefined });

    expect(created.status).toBe(201);

  });


  test("a customer's plans list and the business-wide list both surface the created plan", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PlanList");
    const customerId = await createCustomer(authHeader, "List Customer");

    const created = await createPlan(authHeader, customerId);

    const customerList = await request(app)
      .get(`/api/service-agreements/customer/${customerId}`)
      .set("Authorization", authHeader);

    expect(customerList.status).toBe(200);
    expect(customerList.body).toHaveLength(1);
    expect(customerList.body[0].id).toBe(created.body.id);
    expect(customerList.body[0].status).toBe("active");

    const businessList = await request(app)
      .get("/api/service-agreements")
      .set("Authorization", authHeader);

    expect(businessList.status).toBe(200);
    expect(businessList.body[0].customer_name).toBe("List Customer");

  });


  // Regression test for a real depth gap a feature-skim caught: a plan
  // could silently run out of visits with nothing anywhere telling the
  // owner it was getting low. Both list endpoints now surface how many
  // scheduled future visits remain and when the next one is.
  test("both list endpoints report visits remaining and the next visit date, and update after cancelling", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PlanVisitsRemaining");
    const customerId = await createCustomer(authHeader);
    const created = await createPlan(authHeader, customerId);

    const customerList = await request(app)
      .get(`/api/service-agreements/customer/${customerId}`)
      .set("Authorization", authHeader);

    expect(customerList.body[0].visits_remaining).toBe(INITIAL_OCCURRENCES);
    expect(customerList.body[0].next_visit_at).toBeTruthy();

    const businessList = await request(app)
      .get("/api/service-agreements")
      .set("Authorization", authHeader);

    expect(businessList.body[0].visits_remaining).toBe(INITIAL_OCCURRENCES);
    expect(businessList.body[0].next_visit_at).toBe(customerList.body[0].next_visit_at);

    await request(app)
      .patch(`/api/service-agreements/${created.body.id}/status`)
      .set("Authorization", authHeader)
      .send({ status: "cancelled" });

    const afterCancel = await request(app)
      .get(`/api/service-agreements/customer/${customerId}`)
      .set("Authorization", authHeader);

    expect(afterCancel.body[0].visits_remaining).toBe(0);
    expect(afterCancel.body[0].next_visit_at).toBeFalsy();

  });


  test("a plan is scoped to its own business - another business can't see or act on it", async () => {

    const businessA = await createBusinessAndUser(app, "PlanScopeA");
    const businessB = await createBusinessAndUser(app, "PlanScopeB");

    const customerId = await createCustomer(businessA.authHeader);
    const created = await createPlan(businessA.authHeader, customerId);

    const crossList = await request(app)
      .get(`/api/service-agreements/customer/${customerId}`)
      .set("Authorization", businessB.authHeader);

    expect(crossList.body).toHaveLength(0);

    const crossStatus = await request(app)
      .patch(`/api/service-agreements/${created.body.id}/status`)
      .set("Authorization", businessB.authHeader)
      .send({ status: "paused" });

    expect(crossStatus.status).toBe(404);

  });


  test("pausing a plan leaves its future appointments untouched; cancelling cancels only the still-scheduled future ones", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PlanPauseCancel");
    const customerId = await createCustomer(authHeader);

    const created = await createPlan(authHeader, customerId);

    const paused = await request(app)
      .patch(`/api/service-agreements/${created.body.id}/status`)
      .set("Authorization", authHeader)
      .send({ status: "paused" });

    expect(paused.status).toBe(200);

    let list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    let generated = list.body.filter((a) => a.service_agreement_id === created.body.id);
    expect(generated.every((a) => a.status === "scheduled")).toBe(true);

    // Complete one occurrence before cancelling, to prove cancellation
    // doesn't touch history.
    await request(app)
      .patch(`/api/appointments/${generated[0].id}`)
      .set("Authorization", authHeader)
      .send({ status: "completed" });

    const cancelled = await request(app)
      .patch(`/api/service-agreements/${created.body.id}/status`)
      .set("Authorization", authHeader)
      .send({ status: "cancelled" });

    expect(cancelled.status).toBe(200);

    list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    generated = list.body.filter((a) => a.service_agreement_id === created.body.id);

    const stillCompleted = list.body.find((a) => a.status === "completed" && a.service_agreement_id === created.body.id);
    expect(stillCompleted).toBeTruthy();

    const stillScheduledCount = generated.filter((a) => a.status === "scheduled").length;
    expect(stillScheduledCount).toBe(0);

    const nowCancelledCount = generated.filter((a) => a.status === "cancelled").length;
    expect(nowCancelledCount).toBe(INITIAL_OCCURRENCES - 1);

  });


  test("an invalid status value is rejected, and a nonexistent plan 404s", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PlanBadStatus");
    const customerId = await createCustomer(authHeader);
    const created = await createPlan(authHeader, customerId);

    const badStatus = await request(app)
      .patch(`/api/service-agreements/${created.body.id}/status`)
      .set("Authorization", authHeader)
      .send({ status: "on_hold" });

    expect(badStatus.status).toBe(400);

    const notFound = await request(app)
      .patch(`/api/service-agreements/does-not-exist/status`)
      .set("Authorization", authHeader)
      .send({ status: "paused" });

    expect(notFound.status).toBe(404);

  });


  test("renewing an active plan appends more occurrences with no date gap or duplicate", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PlanRenew");
    const customerId = await createCustomer(authHeader);
    const created = await createPlan(authHeader, customerId);

    const renewed = await request(app)
      .post(`/api/service-agreements/${created.body.id}/renew`)
      .set("Authorization", authHeader);

    expect(renewed.status).toBe(200);
    expect(renewed.body.addedCount).toBe(RENEWAL_OCCURRENCES);

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const generated = list.body.filter((a) => a.service_agreement_id === created.body.id);

    expect(generated).toHaveLength(INITIAL_OCCURRENCES + RENEWAL_OCCURRENCES);

    const startTimes = generated.map((a) => a.start_time);
    const uniqueStartTimes = new Set(startTimes);
    expect(uniqueStartTimes.size).toBe(startTimes.length);

    // The 13th occurrence (index 12, quarterly) should be exactly 3
    // months after the 12th (index 11) - continuing the same cadence,
    // not restarting the count from the renewal date.
    const sorted = startTimes.slice().sort();
    const twelfth = new Date(sorted[INITIAL_OCCURRENCES - 1]);
    const thirteenth = new Date(sorted[INITIAL_OCCURRENCES]);
    const monthsApart = (thirteenth.getUTCFullYear() - twelfth.getUTCFullYear()) * 12 + (thirteenth.getUTCMonth() - twelfth.getUTCMonth());
    expect(monthsApart).toBe(3);

  });


  test("renewing a paused or cancelled plan is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PlanRenewBlocked");
    const customerId = await createCustomer(authHeader);
    const created = await createPlan(authHeader, customerId);

    await request(app)
      .patch(`/api/service-agreements/${created.body.id}/status`)
      .set("Authorization", authHeader)
      .send({ status: "paused" });

    const renewPaused = await request(app)
      .post(`/api/service-agreements/${created.body.id}/renew`)
      .set("Authorization", authHeader);

    expect(renewPaused.status).toBe(400);

  });


  test("completing a plan-generated appointment pre-fills the draft invoice with the plan's price", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PlanInvoicePrice");
    const customerId = await createCustomer(authHeader);
    const created = await createPlan(authHeader, customerId, { price: 150 });

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const firstOccurrence = list.body.find((a) => a.service_agreement_id === created.body.id);

    const completed = await request(app)
      .patch(`/api/appointments/${firstOccurrence.id}`)
      .set("Authorization", authHeader)
      .send({ status: "completed" });

    expect(completed.status).toBe(200);
    expect(completed.body.draft_invoice_id).toBeTruthy();

    const invoice = await request(app)
      .get(`/api/quotes/${completed.body.draft_invoice_id}`)
      .set("Authorization", authHeader);

    expect(invoice.body.items[0].unit_price).toBe(150);

  });


  test("completing a plan-generated appointment with no price set still falls back to the $0 placeholder", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PlanInvoiceNoPrice");
    const customerId = await createCustomer(authHeader);
    const created = await createPlan(authHeader, customerId, { price: undefined });

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const firstOccurrence = list.body.find((a) => a.service_agreement_id === created.body.id);

    const completed = await request(app)
      .patch(`/api/appointments/${firstOccurrence.id}`)
      .set("Authorization", authHeader)
      .send({ status: "completed" });

    const invoice = await request(app)
      .get(`/api/quotes/${completed.body.draft_invoice_id}`)
      .set("Authorization", authHeader);

    expect(invoice.body.items[0].unit_price).toBe(0);

  });


  // Regression tests for a real bug a peer review caught: renewal's
  // startIndex is derived from a plain COUNT(*) of the plan's
  // appointments (see countAppointmentsForServiceAgreement), which is
  // only accurate as long as a plan's rows are never actually removed -
  // hard-deleting one middle visit through the plain appointment-delete
  // endpoint would desync that count, and the next renewal would
  // generate a duplicate appointment on an already-used date. The fix is
  // to refuse the hard delete entirely for any plan-linked appointment,
  // which these tests exercise directly.
  describe("Plan-linked appointments resist hard deletion", () => {

    test("deleting a single plan-linked appointment is refused, and the row survives", async () => {

      const { authHeader } = await createBusinessAndUser(app, "PlanDeleteBlocked");
      const customerId = await createCustomer(authHeader);
      const created = await createPlan(authHeader, customerId);

      const before = await request(app)
        .get("/api/appointments")
        .set("Authorization", authHeader);

      const target = before.body.find((a) => a.service_agreement_id === created.body.id);

      const deleteRes = await request(app)
        .delete(`/api/appointments/${target.id}`)
        .set("Authorization", authHeader);

      expect(deleteRes.status).toBe(400);
      expect(deleteRes.body.error.toLowerCase()).toContain("service agreement");

      const after = await request(app)
        .get("/api/appointments")
        .set("Authorization", authHeader);

      expect(after.body.some((a) => a.id === target.id)).toBe(true);
      expect(after.body.filter((a) => a.service_agreement_id === created.body.id)).toHaveLength(INITIAL_OCCURRENCES);

    });


    test("deleting a plan-linked appointment with scope=future is also refused", async () => {

      const { authHeader } = await createBusinessAndUser(app, "PlanDeleteFutureBlocked");
      const customerId = await createCustomer(authHeader);
      const created = await createPlan(authHeader, customerId);

      const before = await request(app)
        .get("/api/appointments")
        .set("Authorization", authHeader);

      const target = before.body.find((a) => a.service_agreement_id === created.body.id);

      const deleteRes = await request(app)
        .delete(`/api/appointments/${target.id}`)
        .set("Authorization", authHeader)
        .send({ scope: "future" });

      expect(deleteRes.status).toBe(400);

      const after = await request(app)
        .get("/api/appointments")
        .set("Authorization", authHeader);

      expect(after.body.filter((a) => a.service_agreement_id === created.body.id)).toHaveLength(INITIAL_OCCURRENCES);

    });


    test("a plain (non-plan) appointment can still be deleted normally", async () => {

      const { authHeader } = await createBusinessAndUser(app, "PlainDeleteStillWorks");

      const created = await request(app)
        .post("/api/appointments")
        .set("Authorization", authHeader)
        .send({ title: "Ordinary appointment", start_time: "2026-09-01T10:00:00.000Z" });

      const deleteRes = await request(app)
        .delete(`/api/appointments/${created.body.id}`)
        .set("Authorization", authHeader);

      expect(deleteRes.status).toBe(200);

    });


    test("renewal stays gap-free and duplicate-free even after a blocked delete attempt", async () => {

      const { authHeader } = await createBusinessAndUser(app, "PlanRenewAfterBlockedDelete");
      const customerId = await createCustomer(authHeader);
      const created = await createPlan(authHeader, customerId);

      const before = await request(app)
        .get("/api/appointments")
        .set("Authorization", authHeader);

      const generated = before.body.filter((a) => a.service_agreement_id === created.body.id);

      // Attempt (and fail) to delete a middle occurrence, same as the
      // original bug report's scenario.
      await request(app)
        .delete(`/api/appointments/${generated[4].id}`)
        .set("Authorization", authHeader);

      const renewed = await request(app)
        .post(`/api/service-agreements/${created.body.id}/renew`)
        .set("Authorization", authHeader);

      expect(renewed.status).toBe(200);
      expect(renewed.body.addedCount).toBe(RENEWAL_OCCURRENCES);

      const after = await request(app)
        .get("/api/appointments")
        .set("Authorization", authHeader);

      const allGenerated = after.body.filter((a) => a.service_agreement_id === created.body.id);

      expect(allGenerated).toHaveLength(INITIAL_OCCURRENCES + RENEWAL_OCCURRENCES);

      const startTimes = allGenerated.map((a) => a.start_time);
      expect(new Set(startTimes).size).toBe(startTimes.length);

    });

  });


  // Regression test for a real bug a review pass caught: STATUSES
  // allowed any transition, including cancelled -> active, even though
  // cancelling had already flipped every future visit to 'cancelled' -
  // nothing un-cancels them, so the plan would read "active" while
  // having no real schedule behind it.
  test("a cancelled plan can't be reactivated", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PlanCancelFinal");
    const customerId = await createCustomer(authHeader);
    const created = await createPlan(authHeader, customerId);

    await request(app)
      .patch(`/api/service-agreements/${created.body.id}/status`)
      .set("Authorization", authHeader)
      .send({ status: "cancelled" });

    const reactivate = await request(app)
      .patch(`/api/service-agreements/${created.body.id}/status`)
      .set("Authorization", authHeader)
      .send({ status: "active" });

    expect(reactivate.status).toBe(400);

    const list = await request(app)
      .get(`/api/service-agreements/customer/${customerId}`)
      .set("Authorization", authHeader);

    expect(list.body[0].status).toBe("cancelled");

  });


  // Regression test for a real bug a review pass caught: start_time is
  // stored as a JS ISO string ("...T...Z"), while raw SQLite
  // datetime('now') is space-separated with no T/Z - comparing them
  // directly as strings made every appointment on the SAME calendar day
  // as "now" register as "future" regardless of its actual time,
  // because 'T' sorts higher than ' ' at the first point they differ.
  // Cancelling a plan could wrongly cancel a visit from earlier the same
  // day - exactly the "must never touch history" case the function's
  // own comment says can't happen.
  test("cancelling a plan doesn't cancel a visit scheduled earlier today", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PlanCancelSameDay");
    const customerId = await createCustomer(authHeader);
    const created = await createPlan(authHeader, customerId);

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const oneOccurrence = list.body.find((a) => a.service_agreement_id === created.body.id);

    // Backdated to earlier today (real wall-clock "today", not the
    // plan's own fictional future start_date) - this is the exact
    // shape that tripped the string-comparison bug.
    const earlierToday = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    await runAsync(
      `UPDATE appointments SET start_time = ? WHERE id = ?`,
      [earlierToday, oneOccurrence.id]
    );

    await request(app)
      .patch(`/api/service-agreements/${created.body.id}/status`)
      .set("Authorization", authHeader)
      .send({ status: "cancelled" });

    const after = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const stillThere = after.body.find((a) => a.id === oneOccurrence.id);

    expect(stillThere.status).toBe("scheduled");

  });

});
