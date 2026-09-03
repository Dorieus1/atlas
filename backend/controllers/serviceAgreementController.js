const {
  createServiceAgreement: createServiceAgreementService,
  getServiceAgreementById,
  getServiceAgreementsByCustomer,
  getServiceAgreementsByBusiness,
  updateServiceAgreementStatus: updateServiceAgreementStatusService,
  updateServiceAgreementDetails: updateServiceAgreementDetailsService,
  renewServiceAgreement: renewServiceAgreementService,
  STATUSES
} = require("../services/serviceAgreementService");

const { RECURRENCE_RULES } = require("../services/appointmentService");
const { getCustomerById } = require("../services/customerService");
const { getUserById } = require("../services/authService");


const MIN_DURATION_MINUTES = 15;
const MAX_DURATION_MINUTES = 24 * 60;

// Shared by create and the details-edit endpoint below, matching the
// "unset is fine, but if it's set it has to make sense" treatment
// every other optional numeric field in this app already gets.
function validateDuration(duration_minutes) {

  if (duration_minutes === undefined || duration_minutes === null || duration_minutes === "") {
    return null;
  }

  const value = Number(duration_minutes);

  if (!Number.isInteger(value) || value < MIN_DURATION_MINUTES || value > MAX_DURATION_MINUTES) {
    return `duration_minutes must be a whole number between ${MIN_DURATION_MINUTES} and ${MAX_DURATION_MINUTES}`;
  }

  return null;

}


const createServiceAgreement = async (req, res) => {

  try {

    const { customer_id, title, notes, price, frequency, start_date, duration_minutes, assigned_user_id } = req.body;

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

    const durationError = validateDuration(duration_minutes);

    if (durationError) {

      return res.status(400).json({
        error: durationError
      });

    }

    const normalizedDuration = duration_minutes === undefined || duration_minutes === null || duration_minutes === ""
      ? null
      : Number(duration_minutes);

    // Same pattern as appointmentController's own assigned_user_id check
    // - assignment isn't gated by role, so any user belonging to the
    // business (owner or staff) is a valid assignee.
    if (assigned_user_id) {

      const assignee = await getUserById(assigned_user_id, req.user.business_id);

      if (!assignee) {

        return res.status(400).json({
          error: "Assignee not found"
        });

      }

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
      actingUser ? actingUser.name : null,
      normalizedDuration,
      assigned_user_id || null

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



// Edits a plan's own details - name, notes, price per visit, per-visit
// duration, and which crew member normally covers it. Deliberately
// excludes frequency and start_date (see updateServiceAgreementDetails'
// own comment for why) - those would need regenerating the whole
// series, a bigger operation than an in-place edit.
const updateServiceAgreementDetails = async (req, res) => {

  try {

    const { id } = req.params;
    const { title, notes, price, duration_minutes, assigned_user_id } = req.body;

    const existing = await getServiceAgreementById(id, req.user.business_id);

    if (!existing) {

      return res.status(404).json({
        error: "Service agreement not found"
      });

    }

    const fields = {};

    if (title !== undefined) {

      if (!title.trim()) {

        return res.status(400).json({
          error: "Title is required"
        });

      }

      fields.title = title.trim();

    }

    if (notes !== undefined) {
      fields.notes = notes || null;
    }

    if (price !== undefined) {

      const hasPrice = price !== null && price !== "";
      const normalizedPrice = hasPrice ? Number(price) : null;

      if (hasPrice && (!Number.isFinite(normalizedPrice) || normalizedPrice < 0)) {

        return res.status(400).json({
          error: "price must be a non-negative number"
        });

      }

      fields.price = normalizedPrice;

    }

    if (duration_minutes !== undefined) {

      const durationError = validateDuration(duration_minutes);

      if (durationError) {

        return res.status(400).json({
          error: durationError
        });

      }

      fields.duration_minutes = duration_minutes === null || duration_minutes === "" ? null : Number(duration_minutes);

    }

    if (assigned_user_id !== undefined) {

      if (assigned_user_id) {

        const assignee = await getUserById(assigned_user_id, req.user.business_id);

        if (!assignee) {

          return res.status(400).json({
            error: "Assignee not found"
          });

        }

      }

      fields.assigned_user_id = assigned_user_id || null;

    }

    const result = await updateServiceAgreementDetailsService(id, req.user.business_id, fields);

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

  updateServiceAgreementDetails,

  renewServiceAgreement

};
