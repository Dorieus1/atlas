const {
  createServiceAgreement: createServiceAgreementService,
  getServiceAgreementById,
  getServiceAgreementsByCustomer,
  getServiceAgreementsByBusiness,
  updateServiceAgreementStatus: updateServiceAgreementStatusService,
  renewServiceAgreement: renewServiceAgreementService,
  STATUSES
} = require("../services/serviceAgreementService");

const { RECURRENCE_RULES } = require("../services/appointmentService");
const { getCustomerById } = require("../services/customerService");
const { getUserById } = require("../services/authService");


const createServiceAgreement = async (req, res) => {

  try {

    const { customer_id, title, notes, price, frequency, start_date } = req.body;

    if (!customer_id) {

      return res.status(400).json({
        error: "customer_id is required"
      });

    }

    const customer = await getCustomerById(customer_id, req.user.business_id);

    if (!customer) {

      return res.status(400).json({
        error: "Customer not found"
      });

    }

    if (!title || !title.trim()) {

      return res.status(400).json({
        error: "Title is required"
      });

    }

    if (!RECURRENCE_RULES.has(frequency)) {

      return res.status(400).json({
        error: "frequency must be one of: " + [...RECURRENCE_RULES].join(", ")
      });

    }

    if (!start_date || Number.isNaN(new Date(start_date).getTime())) {

      return res.status(400).json({
        error: "A valid start_date is required"
      });

    }

    // Same "unset is fine" treatment as everywhere else money is
    // optional in this app (default_tax_rate, default_hourly_labor_cost)
    // - not every plan bills a fixed amount per visit.
    const hasPrice = price !== undefined && price !== null && price !== "";
    const normalizedPrice = hasPrice ? Number(price) : null;

    if (hasPrice && (!Number.isFinite(normalizedPrice) || normalizedPrice < 0)) {

      return res.status(400).json({
        error: "price must be a non-negative number"
      });

    }

    const actingUser = await getUserById(req.user.id, req.user.business_id);

    const id = await createServiceAgreementService(

      req.user.business_id,
      customer_id,
      title.trim(),
      notes || null,
      normalizedPrice,
      frequency,
      new Date(start_date).toISOString(),
      req.user.id,
      actingUser ? actingUser.name : null

    );

    res.status(201).json({ id });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const getCustomerServiceAgreements = async (req, res) => {

  try {

    const { customer_id } = req.params;

    const agreements = await getServiceAgreementsByCustomer(customer_id, req.user.business_id);

    res.json(agreements);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const getAllServiceAgreements = async (req, res) => {

  try {

    const agreements = await getServiceAgreementsByBusiness(req.user.business_id);

    res.json(agreements);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const updateServiceAgreementStatus = async (req, res) => {

  try {

    const { id } = req.params;
    const { status } = req.body;

    if (!STATUSES.has(status)) {

      return res.status(400).json({
        error: "status must be one of: " + [...STATUSES].join(", ")
      });

    }

    const result = await updateServiceAgreementStatusService(id, req.user.business_id, status);

    if (result.error === "cancelled_is_final") {

      return res.status(400).json({
        error: "This plan was cancelled and can't be reactivated - create a new plan instead"
      });

    }

    if (result.error) {

      return res.status(404).json({
        error: "Service agreement not found"
      });

    }

    res.json({
      message: "Service agreement updated"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const renewServiceAgreement = async (req, res) => {

  try {

    const { id } = req.params;

    const agreement = await getServiceAgreementById(id, req.user.business_id);

    if (!agreement) {

      return res.status(404).json({
        error: "Service agreement not found"
      });

    }

    const result = await renewServiceAgreementService(id, req.user.business_id);

    // A review pass caught that this could fall through unhandled: the
    // service re-fetches and re-checks the plan itself (see
    // renewServiceAgreement), so a plan deleted in the narrow window
    // between this controller's own pre-check above and that re-fetch
    // would return here, not "not_active" - and with no branch for it,
    // the response would have been "Added undefined more visits" with a
    // 200. No known path can delete a service_agreements row today, but
    // there's no reason this endpoint's correctness should depend on
    // that staying true forever.
    if (result.error === "not_found") {

      return res.status(404).json({
        error: "Service agreement not found"
      });

    }

    if (result.error === "not_active") {

      return res.status(400).json({
        error: "Only an active plan can be renewed - reactivate it first"
      });

    }

    res.json({
      message: `Added ${result.addedCount} more visits`,
      addedCount: result.addedCount
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



module.exports = {

  createServiceAgreement,

  getCustomerServiceAgreements,

  getAllServiceAgreements,

  updateServiceAgreementStatus,

  renewServiceAgreement

};
