const {
  createAppointment: createAppointmentService,
  createRecurringAppointments: createRecurringAppointmentsService,
  getAppointmentById,
  getAppointments: getAppointmentsService,
  getAppointmentsByCustomer: getAppointmentsByCustomerService,
  updateAppointmentStatus: updateAppointmentStatusService,
  updateAppointmentStatusForSeries: updateAppointmentStatusForSeriesService,
  rescheduleAppointment: rescheduleAppointmentService,
  deleteAppointment: deleteAppointmentService,
  deleteAppointmentForSeries: deleteAppointmentForSeriesService,
  RECURRENCE_RULES,
  MAX_RECURRING_OCCURRENCES
} = require("../services/appointmentService");

const { getCustomerById } = require("../services/customerService");

const {
  createQuote,
  getQuoteByAppointmentId
} = require("../services/quoteService");

const { getUserById } = require("../services/authService");


const VALID_STATUSES = ["scheduled", "completed", "cancelled"];



const createAppointment = async (req, res) => {

  try {

    const {
      customer_id,
      title,
      notes,
      start_time,
      end_time,
      recurrence,
      occurrences,
      assigned_user_id
    } = req.body;

    const business_id = req.user.business_id;

    if (!title || !title.trim() || !start_time) {

      return res.status(400).json({
        error: "title and start_time are required"
      });

    }

    if (title.length > 200) {

      return res.status(400).json({
        error: "Title is too long"
      });

    }

    if (Number.isNaN(new Date(start_time).getTime())) {

      return res.status(400).json({
        error: "start_time is not a valid date"
      });

    }

    if (end_time && Number.isNaN(new Date(end_time).getTime())) {

      return res.status(400).json({
        error: "end_time is not a valid date"
      });

    }

    if (end_time && new Date(end_time) < new Date(start_time)) {

      return res.status(400).json({
        error: "end_time can't be before start_time"
      });

    }

    if (customer_id) {

      const customer = await getCustomerById(customer_id, business_id);

      if (!customer) {

        return res.status(404).json({
          error: "Customer not found"
        });

      }

    }

    // Same pattern as customer_id above - assignment isn't gated by
    // role, so any user belonging to the business (owner or staff) is a
    // valid assignee.
    if (assigned_user_id) {

      const assignee = await getUserById(assigned_user_id, business_id);

      if (!assignee) {

        return res.status(400).json({
          error: "Assignee not found"
        });

      }

    }

    // Snapshot the acting user's current name at creation time - see the
    // matching comment in customerController.createCustomer for why this
    // isn't a live join to `users`.
    const actingUser = await getUserById(req.user.id, business_id);
    const createdByUserId = req.user.id;
    const createdByName = actingUser ? actingUser.name : null;

    // Recurrence is entirely optional - omitting it keeps this endpoint
    // byte-for-byte the same single-appointment behavior it always had.
    if (recurrence !== undefined && recurrence !== null && recurrence !== "") {

      if (!RECURRENCE_RULES.has(recurrence)) {

        return res.status(400).json({
          error: "recurrence must be one of: " + [...RECURRENCE_RULES].join(", ")
        });

      }

      const occurrenceCount = Number(occurrences);

      if (!Number.isInteger(occurrenceCount) || occurrenceCount < 1) {

        return res.status(400).json({
          error: "occurrences must be a whole number of at least 1"
        });

      }

      if (occurrenceCount > MAX_RECURRING_OCCURRENCES) {

        return res.status(400).json({
          error: `occurrences can't exceed ${MAX_RECURRING_OCCURRENCES}`
        });

      }

      const { recurrence_id, ids } = await createRecurringAppointmentsService(

        business_id,
        customer_id || null,
        title.trim(),
        notes,
        start_time,
        end_time,
        "scheduled",
        recurrence,
        occurrenceCount,
        createdByUserId,
        createdByName,
        assigned_user_id || null

      );

      return res.status(201).json({
        id: ids[0],
        ids,
        recurrence_id,
        message: `${ids.length} recurring appointments scheduled`
      });

    }

    const id = await createAppointmentService(

      business_id,
      customer_id || null,
      title.trim(),
      notes,
      start_time,
      end_time,
      "scheduled",
      createdByUserId,
      createdByName,
      assigned_user_id || null

    );

    res.status(201).json({
      id,
      message: "Appointment scheduled"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const getAppointments = async (req, res) => {

  try {

    const appointments = await getAppointmentsService(req.user.business_id);

    res.json(appointments);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const getCustomerAppointments = async (req, res) => {

  try {

    const { customer_id } = req.params;
    const business_id = req.user.business_id;

    const customer = await getCustomerById(customer_id, business_id);

    if (!customer) {

      return res.status(404).json({
        error: "Customer not found"
      });

    }

    const appointments = await getAppointmentsByCustomerService(customer_id, business_id);

    res.json(appointments);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const updateAppointmentStatus = async (req, res) => {

  try {

    const { id } = req.params;
    const { status, scope, assigned_user_id } = req.body;

    if (!VALID_STATUSES.includes(status)) {

      return res.status(400).json({
        error: "status must be one of: " + VALID_STATUSES.join(", ")
      });

    }

    const business_id = req.user.business_id;

    // Reassignment rides along on this same PATCH rather than a new
    // endpoint - `assigned_user_id` is optional, and its mere presence in
    // the request body (even as `null`, to unassign) is what opts in;
    // omitting it entirely leaves the existing assignment untouched, same
    // pattern as the customer_id/assigned_user_id validation on create.
    const hasAssignedUserId = Object.prototype.hasOwnProperty.call(req.body, "assigned_user_id");

    if (hasAssignedUserId && assigned_user_id) {

      const assignee = await getUserById(assigned_user_id, business_id);

      if (!assignee) {

        return res.status(400).json({
          error: "Assignee not found"
        });

      }

    }

    // "future" is an explicit opt-in for a series - default behavior
    // (omitted or "this") is untouched, single-row, exactly as before.
    // Reassignment only applies to that single-row path - reassigning an
    // entire future series isn't part of this task, so scope="future"
    // continues to only ever touch status, exactly as before.
    const updated = scope === "future"
      ? await updateAppointmentStatusForSeriesService(id, business_id, status)
      : await updateAppointmentStatusService(id, business_id, status, hasAssignedUserId ? assigned_user_id : undefined);

    if (!updated) {

      return res.status(404).json({
        error: "Appointment not found"
      });

    }

    let draftInvoiceId = null;

    // Best-effort automation: a completed job usually needs billing, so
    // give the business a head start with a draft invoice already
    // pre-filled from the appointment, instead of starting from a blank
    // form. A failure here must never make an otherwise-successful status
    // update look like it failed.
    if (status === "completed") {

      try {

        const appointment = await getAppointmentById(id, business_id);

        if (appointment && appointment.customer_id) {

          const existing = await getQuoteByAppointmentId(id, business_id);

          if (existing) {

            draftInvoiceId = existing.id;

          } else {

            // Attributed to whoever marked the appointment completed -
            // it's their action that triggered this invoice.
            const actingUser = await getUserById(req.user.id, business_id);

            const draftInvoice = await createQuote(

              business_id,

              appointment.customer_id,

              "invoice",

              `Auto-created from the completed appointment "${appointment.title}"`,

              [{ description: appointment.title, quantity: 1, unit_price: 0 }],

              id,

              req.user.id,

              actingUser ? actingUser.name : null

            );

            draftInvoiceId = draftInvoice.id;

          }

        }

      } catch (invoiceError) {

        console.error("AUTO-INVOICE CREATION FAILED:", invoiceError);

      }

    }

    res.json({
      message: "Appointment updated",
      draft_invoice_id: draftInvoiceId
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



// Drag-to-reschedule from Schedule.jsx's month view - its own endpoint
// rather than folded into updateAppointmentStatus above, which already
// has enough going on (status transitions, series scope, reassignment,
// auto-invoicing) without also owning date math. Always single-row -
// see rescheduleAppointment's own comment in appointmentService.js for
// why a drag never touches a whole recurring series.
const rescheduleAppointment = async (req, res) => {

  try {

    const { id } = req.params;
    const { start_time } = req.body;
    const business_id = req.user.business_id;

    if (!start_time || Number.isNaN(new Date(start_time).getTime())) {

      return res.status(400).json({
        error: "A valid start_time is required"
      });

    }

    const updated = await rescheduleAppointmentService(id, business_id, new Date(start_time).toISOString());

    if (!updated) {

      return res.status(404).json({
        error: "Appointment not found"
      });

    }

    res.json({
      message: "Appointment rescheduled"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const deleteAppointment = async (req, res) => {

  try {

    const { id } = req.params;
    const business_id = req.user.business_id;

    // Same explicit opt-in shape as the status update above - a plain
    // DELETE with no body (or scope !== "future") stays single-row.
    const deleted = req.body && req.body.scope === "future"
      ? await deleteAppointmentForSeriesService(id, business_id)
      : await deleteAppointmentService(id, business_id);

    if (!deleted) {

      return res.status(404).json({
        error: "Appointment not found"
      });

    }

    res.json({
      message: "Appointment removed"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



module.exports = {

  createAppointment,

  getAppointments,

  getCustomerAppointments,

  updateAppointmentStatus,

  rescheduleAppointment,

  deleteAppointment

};
