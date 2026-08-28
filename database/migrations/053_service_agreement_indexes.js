const { run } = require("./util");

module.exports = async (db) => {

  // A review pass noted migration 051 added service_agreement_id with
  // no supporting index, despite two hot paths scanning it on every
  // call: countAppointmentsForServiceAgreement (every renewal) and
  // cancelFutureServiceAgreementAppointments (every cancellation) both
  // filter appointments by it. Fine at today's scale, but there's no
  // reason to leave a full table scan as the default here.
  await run(db, `
    CREATE INDEX IF NOT EXISTS idx_appointments_service_agreement_id
    ON appointments(service_agreement_id)
  `);

  // Same reasoning for service_agreements' own lookup columns -
  // getServiceAgreementsByCustomer filters by customer_id, and every
  // other function in serviceAgreementService.js filters by business_id
  // (or both, via getServiceAgreementById).
  await run(db, `
    CREATE INDEX IF NOT EXISTS idx_service_agreements_customer_id
    ON service_agreements(customer_id)
  `);

  await run(db, `
    CREATE INDEX IF NOT EXISTS idx_service_agreements_business_id
    ON service_agreements(business_id)
  `);

};
