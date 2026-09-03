const { getBusinessBySlug, getBusinessById } = require("../services/businessService");
const { getActiveCustomerById, getActiveCustomerByEmail } = require("../services/customerService");
const { createLoginToken, consumeLoginToken, signCustomerToken } = require("../services/portalAuthService");
const { sendEmail, escapeHtml } = require("../services/emailService");
const { getQuotesByCustomer, getQuoteById, updateQuoteFields, formatQuoteNumber, calculateDeposit, validateSignature, validateTierSelection, acceptQuoteWithSignatureAtomic } = require("../services/quoteService");
const {
  getAppointmentsByCustomer,
  createAppointment,
  getAppointmentById,
  updateAppointmentStatus,
  rescheduleAppointment: rescheduleAppointmentService
} = require("../services/appointmentService");
const { checkWithinBusinessHours } = require("../services/businessHoursService");
const { getPhotosByCustomer } = require("../services/photoService");
const { createNotification } = require("../services/notificationService");
const { createCheckoutSession } = require("../services/stripeService");
const { streamQuotePdf } = require("../services/pdfService");


const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";


const MAX_TITLE_LENGTH = 200;
const MAX_APPROVAL_NAME_LENGTH = 200;


// Maps a quote's current status to the specific reason it can't be
// accepted/declined right now, for the 400 both endpoints below return
// when status isn't 'sent' - a draft was never sent to the customer, and
// an already-decided (or already-paid) quote shouldn't be re-actioned.
function wrongQuoteStatusError(quote) {

  if (quote.status === "accepted") {
    return "This has already been accepted";
  }

  if (quote.status === "declined") {
    return "This has already been declined";
  }

  if (quote.status === "paid") {
    return "This has already been paid";
  }

  // draft, or any other non-"sent" status.
  return "This hasn't been sent to you yet";

}


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
            <p>Hi ${escapeHtml(customer.name) || "there"},</p>
            <p>Click below to view your appointments, quotes, and photos with ${escapeHtml(business.name)}.</p>
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



// Shared by cancelMyAppointment and rescheduleMyAppointment below - both
// need the exact same "does this appointment belong to this customer,
// and is it something a customer is even still allowed to touch" checks
// before doing anything else. Returns the appointment on success, or
// null after having already written the appropriate error response.
async function loadOwnEditableAppointment(req, res) {

  const appointment = await getAppointmentById(req.params.id, req.customer.business_id);

  if (!appointment || appointment.customer_id !== req.customer.customer_id) {

    res.status(404).json({
      error: "Appointment not found"
    });

    return null;

  }

  if (appointment.status === "cancelled" || appointment.status === "completed") {

    res.status(400).json({
      error: appointment.status === "cancelled"
        ? "This appointment has already been cancelled"
        : "This appointment has already been completed"
    });

    return null;

  }

  if (new Date(appointment.start_time).getTime() < Date.now()) {

    res.status(400).json({
      error: "This appointment has already passed"
    });

    return null;

  }

  return appointment;

}



const cancelMyAppointment = async (req, res) => {

  try {

    const appointment = await loadOwnEditableAppointment(req, res);

    if (!appointment) {
      return;
    }

    await updateAppointmentStatus(appointment.id, req.customer.business_id, "cancelled");

    // Best-effort - the cancellation itself must never fail just because
    // the owner's notification couldn't be created, same reasoning as
    // requestAppointment's own notification above.
    try {

      const customer = await getActiveCustomerById(req.customer.customer_id, req.customer.business_id);

      await createNotification(

        req.customer.business_id,

        "appointment_cancelled",

        `❌ ${customer?.name || "A customer"} cancelled an appointment`,

        appointment.title,

        "/schedule"

      );

    } catch (notificationError) {

      console.error("APPOINTMENT CANCEL NOTIFICATION FAILED:", notificationError);

    }

    res.json({
      message: "Appointment cancelled"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



// A customer moving their own appointment is treated the same as a
// brand-new request, not a silent edit of a confirmed booking: if the
// appointment was already "scheduled" (the owner had confirmed it), the
// new time flips it back to "requested" so the owner has to confirm the
// new time too, through the exact same Schedule page UI that already
// handles a fresh request - a customer unilaterally moving a job the
// business already planned a crew/day around would otherwise go
// unnoticed until someone showed up at the wrong time. An appointment
// already sitting at "requested" just keeps its own status; there's
// nothing to downgrade.
const rescheduleMyAppointment = async (req, res) => {

  try {

    const { start_time } = req.body;

    if (!start_time || Number.isNaN(new Date(start_time).getTime())) {

      return res.status(400).json({
        error: "A valid start_time is required"
      });

    }

    const appointment = await loadOwnEditableAppointment(req, res);

    if (!appointment) {
      return;
    }

    const business = await getBusinessById(req.customer.business_id);

    // Same guard requestAppointment applies to a brand-new booking - a
    // customer-proposed time shouldn't bypass the business's configured
    // hours just because it's a reschedule instead of a fresh request.
    const hoursCheck = checkWithinBusinessHours(business.business_hours, start_time, business.timezone);

    if (!hoursCheck.allowed) {

      return res.status(400).json({
        error: hoursCheck.error
      });

    }

    await rescheduleAppointmentService(appointment.id, req.customer.business_id, new Date(start_time).toISOString());

    if (appointment.status === "scheduled") {

      await updateAppointmentStatus(appointment.id, req.customer.business_id, "requested");

    }

    // Best-effort, same reasoning as every other notification here.
    try {

      const customer = await getActiveCustomerById(req.customer.customer_id, req.customer.business_id);

      await createNotification(

        req.customer.business_id,

        "appointment_reschedule_requested",

        `🔁 ${customer?.name || "A customer"} asked to reschedule an appointment`,

        appointment.title,

        "/schedule"

      );

    } catch (notificationError) {

      console.error("APPOINTMENT RESCHEDULE NOTIFICATION FAILED:", notificationError);

    }

    res.json({
      message: "Appointment reschedule requested"
    });

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



// The list endpoint above is deliberately lightweight (one headline
// total per row, no per-tier breakdown - see getQuotesByCustomer) since
// it has to render a whole list at once. A "Good/Better/Best" quote's
// accept flow needs the FULL breakdown (every option, its own items and
// total) to let the customer actually pick one, which only getQuoteById
// provides - hence this separate single-quote detail endpoint.
const getMyQuote = async (req, res) => {

  try {

    const { id } = req.params;
    const business_id = req.customer.business_id;

    const quote = await getQuoteById(id, business_id);

    if (!quote || quote.customer_id !== req.customer.customer_id) {

      return res.status(404).json({
        error: "Not found"
      });

    }

    res.json({
      ...quote,
      quote_number_formatted: formatQuoteNumber(quote.type, quote.quote_number)
    });

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

    // If a deposit has already been paid, this button must charge only
    // what's actually still owed - never the full items array again on
    // top of a deposit the customer already paid. Same synthetic-line-
    // item technique createDepositCheckout uses for the deposit itself,
    // so the discount (already baked into quote.total) is never applied
    // a second time either.
    let checkoutItems = quote.items;
    let checkoutDiscount = quote.discount_type ? { type: quote.discount_type, value: quote.discount_value } : null;

    // Stripe's `discounts` coupon applies to the WHOLE session (every
    // line item, not just the ones it's "meant" for) - so a coupon and a
    // separately-added tax line item can't coexist: the coupon would
    // also shave a percentage off the tax line, undercharging tax. Tax
    // alone (no discount) is safe as its own line item, since nothing
    // else is proportionally reducing the session. Discount alone is
    // the existing, already-correct coupon path. Only when BOTH are
    // present does this collapse to one synthetic line for the exact
    // final total - same technique the remaining-balance branch below
    // already uses for its own synthetic amount - since that's the one
    // combination the coupon mechanism can't represent correctly.
    if (quote.tax_amount > 0 && checkoutDiscount) {

      const numberPart = quote.quote_number ? formatQuoteNumber(quote.type, quote.quote_number) : null;

      checkoutItems = [{
        description: `Invoice${numberPart ? ` ${numberPart}` : ""} (incl. tax)`,
        quantity: 1,
        unit_price: quote.total
      }];

      checkoutDiscount = null;

    } else if (quote.tax_amount > 0) {

      checkoutItems = [
        ...checkoutItems,
        {
          description: `Tax (${quote.tax_rate}%)`,
          quantity: 1,
          unit_price: quote.tax_amount
        }
      ];

    }

    // quote.amount_paid (getQuoteById, quoteService.js) already combines
    // BOTH ways money can be on the books before this button is ever
    // pressed - a Stripe deposit and any manually-recorded payments
    // (cash/check/etc., addQuotePayment) - so this one check covers
    // either or both, instead of only ever looking at deposit_paid_at
    // and silently ignoring manual payments recorded against the same
    // invoice (which would otherwise charge the customer the full
    // original total a second time on top of what they already paid).
    if (quote.amount_paid > 0) {

      if (quote.balance_due <= 0) {

        return res.status(400).json({
          error: "This invoice is fully covered by payments already made"
        });

      }

      const numberPart = quote.quote_number ? formatQuoteNumber(quote.type, quote.quote_number) : null;

      checkoutItems = [{
        description: `Remaining balance for Invoice${numberPart ? ` ${numberPart}` : ""} (after $${quote.amount_paid.toFixed(2)} already paid)`,
        quantity: 1,
        unit_price: quote.balance_due
      }];

      checkoutDiscount = null;

    }

    const session = await createCheckoutSession(

      business.stripe_account_id,
      checkoutItems,
      `${FRONTEND_URL}/portal/${business.slug}/dashboard?paid=1`,
      `${FRONTEND_URL}/portal/${business.slug}/dashboard?paid=0`,
      { quote_id: quote.id, business_id: business.id, payment_type: "invoice" },
      checkoutDiscount

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



const acceptQuote = async (req, res) => {

  try {

    const { id } = req.params;
    const { name, signature, tier_id } = req.body;
    const business_id = req.customer.business_id;

    if (!name || !name.trim()) {

      return res.status(400).json({
        error: "Please type your name to approve this"
      });

    }

    if (name.trim().length > MAX_APPROVAL_NAME_LENGTH) {

      return res.status(400).json({
        error: "That name is too long"
      });

    }

    const signatureError = validateSignature(signature);

    if (signatureError) {

      return res.status(400).json({
        error: signatureError
      });

    }

    const quote = await getQuoteById(id, business_id);

    if (!quote || quote.customer_id !== req.customer.customer_id) {

      return res.status(404).json({
        error: "Not found"
      });

    }

    // Only a quote actually sent to this customer can be accepted - not a
    // draft they were never meant to see, and not one already decided
    // (accepted/declined) or already paid. Checked here, not just hidden
    // in the UI, since this is what puts a name on the approval record.
    if (quote.status !== "sent") {

      return res.status(400).json({
        error: wrongQuoteStatusError(quote)
      });

    }

    // A "Good/Better/Best" quote can't be approved without saying which
    // package the customer actually picked - a plain quote (the common
    // case) has no tiers, so this is always a no-op for it.
    const tierError = validateTierSelection(quote, tier_id);

    if (tierError) {

      return res.status(400).json({
        error: tierError
      });

    }

    const approvedName = name.trim();

    // The status check above is a friendly, informative rejection for
    // the common case; this atomic write is the real gate against two
    // near-simultaneous accept attempts (an ordinary double-tap on a
    // slow connection) both passing that check before either write
    // lands - see acceptQuoteWithSignatureAtomic's own comment.
    const won = await acceptQuoteWithSignatureAtomic(id, business_id, {
      accepted_by_name: approvedName,
      signature,
      signature_method: "portal",
      accepted_tier_id: tier_id || null,
      signed_ip_address: req.ip || null,
      signed_user_agent: req.headers["user-agent"] || null
    });

    if (!won) {

      return res.status(400).json({
        error: "This has already been accepted"
      });

    }

    // Best-effort - the customer's approval is already saved above, so a
    // notification hiccup must never make that look like it failed.
    try {

      await createNotification(

        business_id,

        "quote_accepted",

        `✅ ${approvedName} accepted a ${quote.type}`,

        quote.quote_number ? formatQuoteNumber(quote.type, quote.quote_number) : null,

        "/quotes"

      );

    } catch (notificationError) {

      console.error("QUOTE ACCEPT NOTIFICATION FAILED:", notificationError);

    }

    res.json({ message: "Accepted" });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const declineQuote = async (req, res) => {

  try {

    const { id } = req.params;
    const business_id = req.customer.business_id;

    const quote = await getQuoteById(id, business_id);

    if (!quote || quote.customer_id !== req.customer.customer_id) {

      return res.status(404).json({
        error: "Not found"
      });

    }

    if (quote.status !== "sent") {

      return res.status(400).json({
        error: wrongQuoteStatusError(quote)
      });

    }

    await updateQuoteFields(id, business_id, {
      status: "declined",
      declined_at: new Date().toISOString()
    });

    try {

      const customer = await getActiveCustomerById(req.customer.customer_id, business_id);

      await createNotification(

        business_id,

        "quote_declined",

        `❌ ${customer?.name || "A customer"} declined a ${quote.type}`,

        quote.quote_number ? formatQuoteNumber(quote.type, quote.quote_number) : null,

        "/quotes"

      );

    } catch (notificationError) {

      console.error("QUOTE DECLINE NOTIFICATION FAILED:", notificationError);

    }

    res.json({ message: "Declined" });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



// The deposit equivalent of createInvoiceCheckout above, reusing the same
// createCheckoutSession() Stripe integration but with a single synthetic
// line item representing just the deposit amount - NOT the quote's real
// items array, which would charge the full total. The session's metadata
// is tagged payment_type: 'deposit' so the webhook (stripeWebhookController)
// can tell this apart from a full invoice/quote payment and only set
// deposit_paid_at, never status/paid_at.
const createDepositCheckout = async (req, res) => {

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
        error: "Not found"
      });

    }

    if (!quote.deposit_type || quote.deposit_value === null || quote.deposit_value === undefined) {

      return res.status(400).json({
        error: "No deposit is set up for this"
      });

    }

    if (quote.deposit_paid_at) {

      return res.status(400).json({
        error: "The deposit has already been paid"
      });

    }

    // A deposit only makes sense once the customer has actually agreed to
    // the job - see the matching status check on acceptQuote above.
    if (quote.status !== "accepted") {

      return res.status(400).json({
        error: "This can't be paid until you accept it"
      });

    }

    const depositAmount = calculateDeposit(quote.total, quote.deposit_type, quote.deposit_value);

    const label = quote.type === "invoice" ? "Invoice" : "Quote";
    const numberPart = quote.quote_number ? formatQuoteNumber(quote.type, quote.quote_number) : null;

    // A single synthetic line item standing in for the deposit itself,
    // not quote.items - Checkout Sessions charge whatever line items
    // they're given, so this is what keeps the charge at the deposit
    // amount instead of the full quote total.
    const depositItems = [{
      description: `Deposit for ${label}${numberPart ? ` ${numberPart}` : ""}`,
      quantity: 1,
      unit_price: depositAmount
    }];

    const session = await createCheckoutSession(

      business.stripe_account_id,
      depositItems,
      `${FRONTEND_URL}/portal/${business.slug}/dashboard?paid=1`,
      `${FRONTEND_URL}/portal/${business.slug}/dashboard?paid=0`,
      { quote_id: quote.id, business_id: business.id, payment_type: "deposit" }

    );

    await updateQuoteFields(quote.id, business_id, {
      stripe_checkout_session_id: session.id
    });

    res.json({ url: session.url });

  } catch (error) {

    console.error("PORTAL DEPOSIT CHECKOUT ERROR:", error);

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

  cancelMyAppointment,

  rescheduleMyAppointment,

  getMyQuotes,
  getMyQuote,

  downloadMyQuotePdf,

  createInvoiceCheckout,

  acceptQuote,

  declineQuote,

  createDepositCheckout,

  getMyPhotos

};
