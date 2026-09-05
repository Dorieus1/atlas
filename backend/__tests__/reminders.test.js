const request = require("supertest");
const app = require("../server");
const db = require("../../database/db");
const { createBusinessAndUser } = require("./setup/helpers");
const { sendAppointmentReminders } = require("../services/reminderService");


const createCustomer = async (authHeader, name, email) => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name, email });

  return res.body.id;

};


const createAppointment = async (authHeader, customerId, title, hoursFromNow) => {

  const startTime = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();

  const res = await request(app)
    .post("/api/appointments")
    .set("Authorization", authHeader)
    .send({ customer_id: customerId, title, start_time: startTime });

  return res.body.id;

};


const getReminderSentAt = (appointmentId) => {

  return new Promise((resolve, reject) => {

    db.get(
      "SELECT reminder_sent_at FROM appointments WHERE id = ?",
      [appointmentId],
      (err, row) => (err ? reject(err) : resolve(row?.reminder_sent_at))
    );

  });

};


describe("Appointment reminder emails", () => {

  beforeEach(() => {
    global.fetch.mockClear();
  });


  test("an appointment about 24 hours out with a customer email gets a reminder, and is marked sent", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ReminderDue");
    const customerId = await createCustomer(authHeader, "Due Customer", "due@test.com");
    const apptId = await createAppointment(authHeader, customerId, "Roof inspection", 24);

    const sentCount = await sendAppointmentReminders();

    expect(sentCount).toBeGreaterThanOrEqual(1);
    expect(global.fetch).toHaveBeenCalled();

    const reminderSentAt = await getReminderSentAt(apptId);
    expect(reminderSentAt).toBeTruthy();

  });


  test("an appointment well outside the reminder window is left alone", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ReminderFar");
    const customerId = await createCustomer(authHeader, "Far Customer", "far@test.com");
    const apptId = await createAppointment(authHeader, customerId, "Next week", 24 * 7);

    await sendAppointmentReminders();

    const reminderSentAt = await getReminderSentAt(apptId);
    expect(reminderSentAt).toBeFalsy();

  });


  test("an appointment already reminded isn't reminded twice, even inside the window", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ReminderTwice");
    const customerId = await createCustomer(authHeader, "Twice Customer", "twice@test.com");
    const apptId = await createAppointment(authHeader, customerId, "Gutter cleaning", 24);

    await sendAppointmentReminders();
    global.fetch.mockClear();

    const secondRun = await sendAppointmentReminders();

    expect(secondRun).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();

  });


  test("a customer with no email on file is skipped, not crashed on", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ReminderNoEmail");
    const customerId = await createCustomer(authHeader, "No Email Customer", undefined);
    await createAppointment(authHeader, customerId, "Job", 24);

    await expect(sendAppointmentReminders()).resolves.toBeDefined();
    expect(global.fetch).not.toHaveBeenCalled();

  });


  test("an appointment with no linked customer is skipped", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ReminderNoCustomer");

    await request(app)
      .post("/api/appointments")
      .set("Authorization", authHeader)
      .send({ title: "Blocked time", start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });

    await expect(sendAppointmentReminders()).resolves.toBeDefined();
    expect(global.fetch).not.toHaveBeenCalled();

  });


  test("a cancelled appointment inside the window is never reminded", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ReminderCancelled");
    const customerId = await createCustomer(authHeader, "Cancelled Customer", "cancelled@test.com");
    const apptId = await createAppointment(authHeader, customerId, "Cancelled job", 24);

    await request(app)
      .patch(`/api/appointments/${apptId}`)
      .set("Authorization", authHeader)
      .send({ status: "cancelled" });

    await sendAppointmentReminders();

    const reminderSentAt = await getReminderSentAt(apptId);
    expect(reminderSentAt).toBeFalsy();

  });


  test("a trashed customer's upcoming appointment is never reminded", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ReminderTrashed");
    const customerId = await createCustomer(authHeader, "Trashed Customer", "trashed@test.com");
    const apptId = await createAppointment(authHeader, customerId, "Roof inspection", 24);

    await request(app)
      .delete(`/api/customers/${customerId}`)
      .set("Authorization", authHeader);

    await sendAppointmentReminders();

    expect(global.fetch).not.toHaveBeenCalled();

    const reminderSentAt = await getReminderSentAt(apptId);
    expect(reminderSentAt).toBeFalsy();

  });


  test("the email content names the right business and includes the appointment title", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ReminderContent");
    const customerId = await createCustomer(authHeader, "Content Customer", "content@test.com");
    await createAppointment(authHeader, customerId, "Chimney repair", 24);

    await sendAppointmentReminders();

    const lastCall = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
    const body = JSON.parse(lastCall[1].body);

    expect(body.to).toEqual(["content@test.com"]);
    expect(body.subject).toContain("ReminderContent Business");
    expect(body.html).toContain("Chimney repair");

  });

});
