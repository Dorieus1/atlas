const {
  createAppointment: createAppointmentService,
  getAppointmentById,
  getAppointments: getAppointmentsService,
  getAppointmentsByCustomer: getAppointmentsByCustomerService,
  updateAppointmentStatus: updateAppointmentStatusService,
  deleteAppointment: deleteAppointmentService
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
      end_time
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
    const { status } = req.body;

    if (!VALID_STATUSES.includes(status)) {

      return res.status(400).json({
        error: "status must be one of: " + VALID_STATUSES.join(", ")
      });

    }

    const business_id = req.user.business_id;

    const updated = await updateAppointmentStatusService(
      id,
      business_id,
      status
    );

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

            draftInvoiceId = await createQuote(

              business_id,

              appointment.customer_id,

              "invoice",

              `Auto-created from the completed appointment "${appointment.title}"`,

              [{ description: appointment.title, quantity: 1, unit_price: 0 }],

              id

            );

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

    const deleted = await deleteAppointmentService(id, req.user.business_id);

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
