const {
  createAppointment: createAppointmentService,
  createRecurringAppointments: createRecurringAppointmentsService,
  getAppointmentById,
  getAppointments: getAppointmentsService,
  getAppointmentsByCustomer: getAppointmentsByCustomerService,
  updateAppointmentStatus: updateAppointmentStatusService,
  updateAppointmentStatusForSeries: updateAppointmentStatusForSeriesService,
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
      occurrences
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
        occurrenceCount

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
      end_time

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
    const { status, scope } = req.body;

    if (!VALID_STATUSES.includes(status)) {

      return res.status(400).json({
        error: "status must be one of: " + VALID_STATUSES.join(", ")
      });

    }

    const business_id = req.user.business_id;

    // "future" is an explicit opt-in for a series - default behavior
    // (omitted or "this") is untouched, single-row, exactly as before.
    const updated = scope === "future"
      ? await updateAppointmentStatusForSeriesService(id, business_id, status)
      : await updateAppointmentStatusService(id, business_id, status);

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

            const draftInvoice = await createQuote(

              business_id,

              appointment.customer_id,

              "invoice",

              `Auto-created from the completed appointment "${appointment.title}"`,

              [{ description: appointment.title, quantity: 1, unit_price: 0 }],

              id

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

  deleteAppointment

};
