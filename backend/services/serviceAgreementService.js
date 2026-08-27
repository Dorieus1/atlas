const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");

const {
  createRecurringAppointments,
  countAppointmentsForServiceAgreement,
  cancelFutureServiceAgreementAppointments
} = require("./appointmentService");


const STATUSES = new Set(["active", "paused", "cancelled"]);

// How many occurrences a brand-new plan gets up front. Deliberately
// smaller than the hard MAX_RECURRING_OCCURRENCES cap (a full batch of
// weekly occurrences there is only ~5.5 months) - a plan is meant to run
// indefinitely, topped up via renewServiceAgreement below as it runs
// low, rather than front-loading years of appointments a customer might
// cancel long before they're ever used.
const INITIAL_OCCURRENCES = 12;

// How many more get appended by one renewal call.
const RENEWAL_OCCURRENCES = 12;


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

const runAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });
  });
};



// Creates the plan row and, in the same call, generates its first batch
// of underlying appointments (see appointmentService.createRecurringAppointments)
// tagged with this plan's id. The two are never allowed to exist without
// each other - a service agreement with zero scheduled visits isn't a
// usable plan, it's just a database row.
const createServiceAgreement = async (

  business_id,
  customer_id,
  title,
  notes,
  price,
  frequency,
  start_date,
  created_by_user_id,
  created_by_name

) => {

  const id = uuidv4();

  await runAsync(

    `
    INSERT INTO service_agreements
    (id, business_id, customer_id, title, notes, price, frequency, status, start_date, created_by_user_id, created_by_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `,

    [id, business_id, customer_id, title, notes || null, price ?? null, frequency, start_date, created_by_user_id || null, created_by_name || null]

  );

  const { recurrence_id } = await createRecurringAppointments(

    business_id,
    customer_id,
    title,
    notes,
    start_date,
    null,
    "scheduled",
    frequency,
    INITIAL_OCCURRENCES,
    created_by_user_id,
    created_by_name,
    null,
    id

  );

  await runAsync(`UPDATE service_agreements SET recurrence_id = ? WHERE id = ?`, [recurrence_id, id]);

  return id;

};



const getServiceAgreementById = (id, business_id) => {

  return getAsync(

    `SELECT * FROM service_agreements WHERE id = ? AND business_id = ?`,

    [id, business_id]

  );

};



const getServiceAgreementsByCustomer = (customer_id, business_id) => {

  return allAsync(

    `
    SELECT *
    FROM service_agreements
    WHERE customer_id = ?
    AND business_id = ?
    ORDER BY created_at DESC
    `,

    [customer_id, business_id]

  );

};



// Business-wide view, customer name joined in - this is the shape a
// future "all active plans" list page would want, even though nothing
// links to one yet (v1 only surfaces plans from the customer's own
// profile).
const getServiceAgreementsByBusiness = (business_id) => {

  return allAsync(

    `
    SELECT service_agreements.*, customers.name as customer_name
    FROM service_agreements
    JOIN customers ON customers.id = service_agreements.customer_id
    WHERE service_agreements.business_id = ?
    ORDER BY service_agreements.created_at DESC
    `,

    [business_id]

  );

};



// active <-> paused is a free transition either way - pausing doesn't
// touch any already-generated appointments (they stay on the schedule;
// pausing is meant for "skip this customer for a while," not "wipe what
// was already booked"). Only cancelling removes future visits, and only
// cancelling is one-way - STATUSES still allows re-activating a paused
// plan, but a cancelled one has to be recreated, matching how a
// cancelled appointment or quote already works elsewhere in this app.
const updateServiceAgreementStatus = async (id, business_id, status) => {

  if (!STATUSES.has(status)) {
    throw new Error(`Invalid service agreement status: ${status}`);
  }

  const result = await runAsync(

    `UPDATE service_agreements SET status = ? WHERE id = ? AND business_id = ?`,

    [status, id, business_id]

  );

  if (result.changes === 0) {
    return false;
  }

  if (status === "cancelled") {
    await cancelFutureServiceAgreementAppointments(id, business_id);
  }

  return true;

};



// Appends another batch of occurrences to an active plan's existing
// series. Refuses on a paused/cancelled plan - renewing a plan the
// business has deliberately stopped would silently put it back on the
// schedule without anyone having re-activated it.
const renewServiceAgreement = async (id, business_id) => {

  const agreement = await getServiceAgreementById(id, business_id);

  if (!agreement) {
    return { error: "not_found" };
  }

  if (agreement.status !== "active") {
    return { error: "not_active" };
  }

  const startIndex = await countAppointmentsForServiceAgreement(id, business_id);

  const { ids, lastOccurrenceStart } = await createRecurringAppointments(

    business_id,
    agreement.customer_id,
    agreement.title,
    agreement.notes,
    agreement.start_date,
    null,
    "scheduled",
    agreement.frequency,
    RENEWAL_OCCURRENCES,
    agreement.created_by_user_id,
    agreement.created_by_name,
    null,
    id,
    startIndex,
    agreement.recurrence_id

  );

  return { addedCount: ids.length, lastOccurrenceStart };

};



module.exports = {

  createServiceAgreement,

  getServiceAgreementById,

  getServiceAgreementsByCustomer,

  getServiceAgreementsByBusiness,

  updateServiceAgreementStatus,

  renewServiceAgreement,

  STATUSES,

  INITIAL_OCCURRENCES,

  RENEWAL_OCCURRENCES

};
