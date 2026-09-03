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


// Roughly a month out from whenever the test actually runs. Every
// visits_remaining / next-visit / cancellation check in this file keys
// off `start_time > datetime('now')`, so the plan's first occurrence
// has to be genuinely in the future - a hardcoded date silently rots
// into an off-by-one (then off-by-more) the moment real time passes it.
const planStartDate = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  d.setUTCHours(10, 0, 0, 0);
  return d.toISOString();
};


const createPlan = async (authHeader, customer_id, overrides = {}) => {

  return request(app)
    .post("/api/service-agreements")
    .set("Authorization", authHeader)
    .send({
      customer_id,
      title: "Quarterly Pest Control",
      frequency: "quarterly",
      start_date: planStartDate(),
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


const inviteTeammate = async (authHeader, prefix) => {

  const res = await request(app)
    .post("/api/auth/teammates")
    .set("Authorization", authHeader)
    .send({
      name: `${prefix} Teammate`,
      email: `${prefix.toLowerCase()}@test.com`,
      password: "testpass123",
      role: "staff"
    });

  return res.body.id;

};


describe("Service agreement depth: per-visit duration, crew assignment, and editing", () => {

  test("a plan's duration and assigned crew member carry through to every generated visit", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PlanDepthCreate");
    const customerId = await createCustomer(authHeader);
    const teammateId = await inviteTeammate(authHeader, "PlanDepthCreateCrew");

    const created = await createPlan(authHeader, customerId, {
      duration_minutes: 90,
      assigned_user_id: teammateId
    });

    expect(created.status).toBe(201);

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const generated = list.body.filter((a) => a.service_agreement_id === created.body.id);

    expect(generated).toHaveLength(INITIAL_OCCURRENCES);
    expect(generated.every((a) => a.assigned_user_id === teammateId)).toBe(true);

    for (const appt of generated) {

      const minutes = (new Date(appt.end_time).getTime() - new Date(appt.start_time).getTime()) / 60000;
      expect(minutes).toBeCloseTo(90);

    }

  });


  test("duration_minutes out of range and an unknown assignee are both rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PlanDepthValidation");
    const customerId = await createCustomer(authHeader);

    const tooShort = await createPlan(authHeader, customerId, { duration_minutes: 5 });
    expect(tooShort.status).toBe(400);

    const tooLong = await createPlan(authHeader, customerId, { duration_minutes: 60 * 25 });
    expect(tooLong.status).toBe(400);

    const notWhole = await createPlan(authHeader, customerId, { duration_minutes: 45.5 });
    expect(notWhole.status).toBe(400);

    const badAssignee = await createPlan(authHeader, customerId, { assigned_user_id: "not-a-real-user" });
    expect(badAssignee.status).toBe(400);

  });


  test("renewing a plan carries its duration and assigned crew member into the new visits too", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PlanDepthRenew");
    const customerId = await createCustomer(authHeader);
    const teammateId = await inviteTeammate(authHeader, "PlanDepthRenewCrew");

    const created = await createPlan(authHeader, customerId, {
      duration_minutes: 45,
      assigned_user_id: teammateId
    });

    await request(app)
      .post(`/api/service-agreements/${created.body.id}/renew`)
      .set("Authorization", authHeader);

    const list = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const generated = list.body.filter((a) => a.service_agreement_id === created.body.id);

    expect(generated).toHaveLength(INITIAL_OCCURRENCES + RENEWAL_OCCURRENCES);
    expect(generated.every((a) => a.assigned_user_id === teammateId)).toBe(true);
    expect(generated.every((a) => {
      const minutes = (new Date(a.end_time).getTime() - new Date(a.start_time).getTime()) / 60000;
      return Math.abs(minutes - 45) < 0.01;
    })).toBe(true);

  });


  test("editing a plan's title, duration, and crew cascades onto its future scheduled visits, but not completed or cancelled ones", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PlanDepthEditCascade");
    const customerId = await createCustomer(authHeader);
    const teammateA = await inviteTeammate(authHeader, "PlanDepthEditCascadeA");
    const teammateB = await inviteTeammate(authHeader, "PlanDepthEditCascadeB");

    const created = await createPlan(authHeader, customerId, {
      duration_minutes: 60,
      assigned_user_id: teammateA
    });

    const beforeEdit = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const generated = beforeEdit.body.filter((a) => a.service_agreement_id === created.body.id);

    // Simulate one visit already completed and one already cancelled -
    // an edit shouldn't touch either's history.
    await runAsync(`UPDATE appointments SET status = 'completed' WHERE id = ?`, [generated[0].id]);
    await runAsync(`UPDATE appointments SET status = 'cancelled' WHERE id = ?`, [generated[1].id]);

    const edited = await request(app)
      .patch(`/api/service-agreements/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({
        title: "Quarterly Pest Control (Updated)",
        duration_minutes: 120,
        assigned_user_id: teammateB
      });

    expect(edited.status).toBe(200);

    const afterEdit = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const byId = Object.fromEntries(afterEdit.body.map((a) => [a.id, a]));

    // The completed one: untouched.
    expect(byId[generated[0].id].title).toBe("Quarterly Pest Control");
    expect(byId[generated[0].id].assigned_user_id).toBe(teammateA);

    // The cancelled one: untouched.
    expect(byId[generated[1].id].assigned_user_id).toBe(teammateA);

    // Every other (still-scheduled, still-future) visit: updated.
    for (const original of generated.slice(2)) {

      const updated = byId[original.id];

      expect(updated.title).toBe("Quarterly Pest Control (Updated)");
      expect(updated.assigned_user_id).toBe(teammateB);

      const minutes = (new Date(updated.end_time).getTime() - new Date(updated.start_time).getTime()) / 60000;
      expect(minutes).toBeCloseTo(120);

    }

    const planAfter = await request(app)
      .get(`/api/service-agreements/customer/${customerId}`)
      .set("Authorization", authHeader);

    expect(planAfter.body[0].title).toBe("Quarterly Pest Control (Updated)");
    expect(planAfter.body[0].duration_minutes).toBe(120);
    expect(planAfter.body[0].assigned_user_id).toBe(teammateB);

  });


  test("editing price alone doesn't touch appointments, and a nonexistent plan 404s", async () => {

    const { authHeader } = await createBusinessAndUser(app, "PlanDepthEditPrice");
    const customerId = await createCustomer(authHeader);

    const created = await createPlan(authHeader, customerId, { price: 100 });

    const beforeEdit = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const before = beforeEdit.body.find((a) => a.service_agreement_id === created.body.id);

    const edited = await request(app)
      .patch(`/api/service-agreements/${created.body.id}`)
      .set("Authorization", authHeader)
      .send({ price: 150 });

    expect(edited.status).toBe(200);

    const afterEdit = await request(app)
      .get("/api/appointments")
      .set("Authorization", authHeader);

    const after = afterEdit.body.find((a) => a.id === before.id);

    // Nothing about the underlying appointment changed.
    expect(after).toEqual(before);

    const planList = await request(app)
      .get(`/api/service-agreements/customer/${customerId}`)
      .set("Authorization", authHeader);

    expect(planList.body[0].price).toBe(150);

    const missing = await request(app)
      .patch("/api/service-agreements/does-not-exist")
      .set("Authorization", authHeader)
      .send({ price: 200 });

    expect(missing.status).toBe(404);

  });


  test("a business can't edit another business's plan", async () => {

    const businessA = await createBusinessAndUser(app, "PlanDepthScopeA");
    const businessB = await createBusinessAndUser(app, "PlanDepthScopeB");

    const customerId = await createCustomer(businessA.authHeader);
    const created = await createPlan(businessA.authHeader, customerId);

    const crossBusiness = await request(app)
      .patch(`/api/service-agreements/${created.body.id}`)
      .set("Authorization", businessB.authHeader)
      .send({ title: "Sneaky Rename" });

    expect(crossBusiness.status).toBe(404);

  });

});
