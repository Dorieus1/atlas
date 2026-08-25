const { getBusinessBySlug, getBusinessById } = require("../services/businessService");
const { getActiveCustomerById, getActiveCustomerByEmail } = require("../services/customerService");
const { createLoginToken, consumeLoginToken, signCustomerToken } = require("../services/portalAuthService");
const { sendEmail } = require("../services/emailService");
const { getQuotesByCustomer, getQuoteById, updateQuoteFields, formatQuoteNumber } = require("../services/quoteService");
const { getAppointmentsByCustomer, createAppointment } = require("../services/appointmentService");
const { checkWithinBusinessHours } = require("../services/businessHoursService");
const { getPhotosByCustomer } = require("../services/photoService");
const { createNotification } = require("../services/notificationService");
const { createCheckoutSession } = require("../services/stripeService");
const { streamQuotePdf } = require("../services/pdfService");


const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";


const MAX_TITLE_LENGTH = 200;


const getPortalBusinessHandler = async (req, res) => {

  try {

    const business = await getBusinessBySlug(req.params.slug);

    if (!business) {

      return res.status(404).json({
        error: "We couldn't find that business"
      });

    }

    res.json({
      name: business.name
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const requestLogin = async (req, res) => {

  try {

    const { email } = req.body;

    if (!email || !email.trim()) {

      return res.status(400).json({
        error: "Email is required"
      });

    }

    const business = await getBusinessBySlug(req.params.slug);

    if (!business) {

      return res.status(404).json({
        error: "We couldn't find that business"
      });

    }

    const customer = await getActiveCustomerByEmail(business.id, email.trim());

    if (customer && customer.email) {

      const token = await createLoginToken(customer.id, business.id);

      const loginUrl =
        `${process.env.FRONTEND_URL || "http://localhost:5173"}/portal/${req.params.slug}?token=${token}`;

      try {

        await sendEmail({

          to: customer.email,

          subject: `Your ${business.name} login link`,

          html: `
            <p>Hi ${customer.name || "there"},</p>
            <p>Click below to view your appointments, quotes, and photos with ${business.name}.</p>
            <p><a href="${loginUrl}">Log in to your portal</a></p>
            <p>This link expires in 15 minutes. If you didn't request this, you can ignore this email.</p>
          `

        });

      } catch (emailError) {

        console.error("PORTAL LOGIN EMAIL ERROR:", emailError);

      }

    }

    // Same response whether or not the email is on file - a different
    // message for "not found" would let anyone probe which emails are
    // registered as customers.
    res.json({
      message: "If that email is on file, we've sent a login link."
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const verifyLogin = async (req, res) => {

  try {

    const { token } = req.body;

    if (!token) {

      return res.status(400).json({
        error: "A login token is required"
      });

    }

    const business = await getBusinessBySlug(req.params.slug);

    if (!business) {

      return res.status(404).json({
        error: "We couldn't find that business"
      });

    }

    const record = await consumeLoginToken(token, business.id);

    if (!record) {

      return res.status(400).json({
        error: "This link is invalid or has expired. Please request a new one."
      });

    }

    const customer = await getActiveCustomerById(record.customer_id, business.id);

    if (!customer) {

      return res.status(404).json({
        error: "We couldn't find your account"
      });

    }

    const customerToken = signCustomerToken(customer.id, business.id);

    res.json({

      token: customerToken,

      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email
      },

      business: {
        name: business.name
      }

    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const getMe = async (req, res) => {

  try {

    const customer = await getActiveCustomerById(req.customer.customer_id, req.customer.business_id);

    if (!customer) {

      return res.status(404).json({
        error: "We couldn't find your account"
      });

    }

    res.json({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const requestAppointment = async (req, res) => {

  try {

    const { title, notes, start_time, end_time } = req.body;

    if (!title || !title.trim() || !start_time) {

      return res.status(400).json({
        error: "title and start_time are required"
      });

    }

    if (title.length > MAX_TITLE_LENGTH) {

      return res.status(400).json({
        error: "Title is too long"
      });

    }

    if (Number.isNaN(new Date(start_time).getTime())) {

      return res.status(400).json({
        error: "start_time is not a valid date"
      });

    }

    const customer = await getActiveCustomerById(req.customer.customer_id, req.customer.business_id);

    if (!customer) {

      return res.status(404).json({
        error: "We couldn't find your account"
      });

    }

    const business = await getBusinessById(req.customer.business_id);

    if (!business) {

      return res.status(404).json({
        error: "We couldn't find that business"
      });

    }

    // Only the customer-facing self-service path is checked against
    // configured hours - staff creating/scheduling appointments directly
    // (appointmentController) can still override for exceptions. A
    // business with no hours configured (business_hours is NULL) is
    // never blocked here.
    const hoursCheck = checkWithinBusinessHours(business.business_hours, start_time, business.timezone);

    if (!hoursCheck.allowed) {

      return res.status(400).json({
        error: hoursCheck.error
      });

    }

    const id = await createAppointment(

      req.customer.business_id,
      customer.id,
      title.trim(),
      notes || null,
      start_time,
      end_time || null,
      "requested"

    );

    // Best-effort - a customer's request should never fail to save just
    // because the owner's notification couldn't be created.
    try {

      await createNotification(

        req.customer.business_id,

        "appointment_requested",

        `📅 ${customer.name || "A customer"} requested an appointment`,

        title.trim(),

        "/schedule"

      );

    } catch (notificationError) {

      console.error("APPOINTMENT REQUEST NOTIFICATION FAILED:", notificationError);

    }

    res.status(201).json({
      id,
      message: "Appointment requested"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const getMyAppointments = async (req, res) => {

  try {

    const appointments = await getAppointmentsByCustomer(req.customer.customer_id, req.customer.business_id);

    res.json(appointments);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const getMyQuotes = async (req, res) => {

  try {

    const quotes = await getQuotesByCustomer(req.customer.customer_id, req.customer.business_id);

    res.json(quotes.map((quote) => ({
      ...quote,
      quote_number_formatted: formatQuoteNumber(quote.type, quote.quote_number)
    })));

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const downloadMyQuotePdf = async (req, res) => {

  try {

    const { id } = req.params;

    const quote = await getQuoteById(id, req.customer.business_id);

    if (!quote || quote.customer_id !== req.customer.customer_id) {

      return res.status(404).json({
        error: "Not found"
      });

    }

    const business = await getBusinessById(req.customer.business_id);

    const numberPart = quote.quote_number ? formatQuoteNumber(quote.type, quote.quote_number) : quote.id.slice(0, 8);
    const filename = `${quote.type}-${numberPart}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    streamQuotePdf(res, quote, business);

  } catch (error) {

    console.error(error);

    if (!res.headersSent) {

      res.status(500).json({
        error: "Something went wrong. Please try again."
      });

    }

  }

};



const createInvoiceCheckout = async (req, res) => {

  try {

    const { id } = req.params;
    const business_id = req.customer.business_id;

    const business = await getBusinessById(business_id);

    if (!business) {

      return res.status(404).json({
        error: "Business not found"
      });

    }

    if (!business.stripe_account_id || !business.stripe_onboarded) {

      return res.status(400).json({
        error: "Online payment isn't set up for this business yet"
      });

    }

    const quote = await getQuoteById(id, business_id);

    if (!quote || quote.customer_id !== req.customer.customer_id) {

      return res.status(404).json({
        error: "Invoice not found"
      });

    }

    if (quote.type !== "invoice") {

      return res.status(400).json({
        error: "Only invoices can be paid online"
      });

    }

    // Draft/declined invoices aren't payable yet - only ones the owner
    // has actually sent (or the customer already accepted). Checked here
    // too, not just hidden in the UI, since this creates a real charge.
    if (quote.status !== "sent" && quote.status !== "accepted") {

      return res.status(400).json({
        error: quote.status === "paid" ? "This invoice is already paid" : "This invoice isn't ready to be paid yet"
      });

    }

    if (!quote.items || quote.items.length === 0) {

      return res.status(400).json({
        error: "This invoice has no line items to charge"
      });

    }

    const session = await createCheckoutSession(

      business.stripe_account_id,
      quote.items,
      `${FRONTEND_URL}/portal/${business.slug}/dashboard?paid=1`,
      `${FRONTEND_URL}/portal/${business.slug}/dashboard?paid=0`,
      { quote_id: quote.id, business_id: business.id },
      quote.discount_type ? { type: quote.discount_type, value: quote.discount_value } : null

    );

    await updateQuoteFields(quote.id, business_id, {
      stripe_checkout_session_id: session.id
    });

    res.json({ url: session.url });

  } catch (error) {

    console.error("PORTAL CHECKOUT ERROR:", error);

    res.status(500).json({
      error: error.message || "Couldn't start checkout. Please try again."
    });

  }

};



const getMyPhotos = async (req, res) => {

  try {

    const photos = await getPhotosByCustomer(req.customer.customer_id, req.customer.business_id);

    res.json(

      photos.map((photo) => ({
        id: photo.id,
        caption: photo.caption,
        created_at: photo.created_at,
        url: `/uploads/photos/${photo.filename}`
      }))

    );

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



module.exports = {

  getPortalBusinessHandler,

  requestLogin,

  verifyLogin,

  getMe,

  requestAppointment,

  getMyAppointments,

  getMyQuotes,

  downloadMyQuotePdf,

  createInvoiceCheckout,

  getMyPhotos

};
