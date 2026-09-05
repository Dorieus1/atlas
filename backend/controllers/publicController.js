const { getBusinessBySlug } = require("../services/businessService");
const { createCustomer, getActiveCustomerById, getActiveCustomerByEmail, getActiveCustomerByPhone } = require("../services/customerService");
const { getConversationHistory } = require("../services/conversationService");
const { processChatMessage } = require("../services/chatService");
const { createNotification } = require("../services/notificationService");
const { getAvailability, createAppointmentIfSlotAvailable, DEFAULT_DURATION_MINUTES } = require("../services/availabilityService");


const MAX_NAME_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_TITLE_LENGTH = 200;
const MAX_NOTES_LENGTH = 2000;


// Shared by both public entry points below (the chat widget's
// startConversation and the booking page's createPublicBooking) - a
// deliberate reversal of an earlier decision to always create a fresh
// customer on every visit and let the separate duplicate-detection/
// merge feature clean it up afterward. In practice that meant a
// returning visitor (closed their browser, switched devices, came back
// the next day - anything that lost the frontend's own sessionStorage-
// based memory of who they are) got a brand-new, disconnected customer
// record every time, silently fragmenting their real conversation/
// quote/appointment history across multiple records and requiring the
// owner to notice and manually merge them. Matching on email or phone
// first reuses their real existing record instead - the same "high
// confidence, essentially never shared by two different real people"
// criterion this app's own duplicate-detection feature already trusts
// enough to offer as a one-click merge. Only ever creates a genuinely
// new customer when no match is found, or the visitor gave neither
// (nothing reliable to match on). Doesn't touch the visitor's given
// name even on a match - an existing record's name is left exactly as
// it was rather than silently overwritten by whatever they happened to
// type this time.
const findOrCreateCustomer = async (business_id, name, email, phone) => {

  if (email) {

    const existing = await getActiveCustomerByEmail(business_id, email);

    if (existing) {
      return { id: existing.id, isReturning: true };
    }

  }

  if (phone) {

    const existing = await getActiveCustomerByPhone(business_id, phone);

    if (existing) {
      return { id: existing.id, isReturning: true };
    }

  }

  const id = await createCustomer(business_id, name.trim(), email || null, phone || null);

  return { id, isReturning: false };

};


const getBusinessBySlugHandler = async (req, res) => {

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



const startConversation = async (req, res) => {

  try {

    const { name, email, phone } = req.body;

    if (!name || !name.trim()) {

      return res.status(400).json({
        error: "Please tell us your name"
      });

    }

    if (name.length > MAX_NAME_LENGTH) {

      return res.status(400).json({
        error: "Name is too long"
      });

    }

    const business = await getBusinessBySlug(req.params.slug);

    if (!business) {

      return res.status(404).json({
        error: "We couldn't find that business"
      });

    }

    const { id: customerId, isReturning } = await findOrCreateCustomer(business.id, name, email, phone);

    // Best-effort - a stranger reaching out through the public chat page
    // is worth flagging, but a failure here must never block them from
    // actually starting the conversation. Still fires for a returning
    // visitor too - "someone's back and chatting" is worth knowing about
    // either way, not just a brand-new lead.
    try {

      await createNotification(

        business.id,

        "new_conversation",

        isReturning
          ? `💬 ${name.trim()} is back and chatting`
          : `💬 ${name.trim()} started a chat`,

        isReturning
          ? "Returning visitor from your public chat page"
          : "New visitor from your public chat page",

        `/customers/${customerId}`

      );

    } catch (notificationError) {

      console.error("NEW CONVERSATION NOTIFICATION FAILED:", notificationError);

    }

    res.status(201).json({
      customer_id: customerId
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const sendPublicMessage = async (req, res) => {

  try {

    const { customer_id, message } = req.body;

    if (!customer_id || !message) {

      return res.status(400).json({
        error: "customer_id and message are required"
      });

    }

    if (message.length > MAX_MESSAGE_LENGTH) {

      return res.status(400).json({
        error: "Message is too long"
      });

    }

    const business = await getBusinessBySlug(req.params.slug);

    if (!business) {

      return res.status(404).json({
        error: "We couldn't find that business"
      });

    }

    // getActiveCustomerById, not getCustomerById - a customer_id sitting
    // in the visitor's own sessionStorage from before they were trashed
    // must not still be able to keep chatting (or, via the AI's own
    // book_appointment tool, book a real appointment) just because their
    // browser hasn't refreshed since.
    const customer = await getActiveCustomerById(customer_id, business.id);

    if (!customer) {

      return res.status(404).json({
        error: "We couldn't find your conversation. Please refresh and start again."
      });

    }

    const result = await processChatMessage(customer, business, message);

    res.json(result);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Couldn't send that message right now. Please try again."
    });

  }

};



const getPublicHistory = async (req, res) => {

  try {

    const { customer_id } = req.params;

    const business = await getBusinessBySlug(req.params.slug);

    if (!business) {

      return res.status(404).json({
        error: "We couldn't find that business"
      });

    }

    const customer = await getActiveCustomerById(customer_id, business.id);

    if (!customer) {

      return res.status(404).json({
        error: "We couldn't find your conversation"
      });

    }

    const history = await getConversationHistory(customer_id);

    res.json(history);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



// The self-service booking page's read side: real open slots for the
// next N days, computed from the business's own hours minus whatever's
// already on the calendar - not just an hours-check like the portal's
// own requestAppointment endpoint does, which never looks at existing
// appointments at all. bookingEnabled tells the frontend whether to show
// a picker or a plain "this business hasn't set up online booking yet"
// message - a business with no business_hours configured has no
// definition of "open" to generate slots from, so this deliberately
// never guesses one.
const getPublicAvailability = async (req, res) => {

  try {

    const business = await getBusinessBySlug(req.params.slug);

    if (!business) {

      return res.status(404).json({
        error: "We couldn't find that business"
      });

    }

    if (!business.business_hours) {

      return res.json({
        bookingEnabled: false,
        businessName: business.name,
        days: []
      });

    }

    const days = await getAvailability(
      business,
      req.query.start_date,
      req.query.days,
      req.query.duration_minutes
    );

    res.json({
      bookingEnabled: true,
      businessName: business.name,
      durationMinutes: Number(req.query.duration_minutes) || DEFAULT_DURATION_MINUTES,
      days
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



// The self-service booking page's write side. Deliberately re-validates
// the chosen slot from scratch (via createAppointmentIfSlotAvailable,
// which does that check and the insert as one atomic unit - see its own
// comment for why a plain separate check-then-insert here left a real
// double-booking race) rather than trusting that a slot the browser
// fetched moments ago is still open - two visitors can always be
// looking at the same page at once. Uses findOrCreateCustomer (see
// above) the same as startConversation - a past version of this comment
// said bookings always created a fresh customer and left deduping to
// the separate merge feature, but that meant a returning customer
// booking again got a brand-new disconnected record every time; the
// user confirmed (2026-09-05) matching on email/phone first is worth
// the small risk of two different real people ever sharing one.
const createPublicBooking = async (req, res) => {

  try {

    const { name, email, phone, start_time, title, notes, duration_minutes } = req.body;

    if (!name || !name.trim()) {

      return res.status(400).json({
        error: "Please tell us your name"
      });

    }

    if (name.length > MAX_NAME_LENGTH) {

      return res.status(400).json({
        error: "Name is too long"
      });

    }

    if (!start_time || Number.isNaN(new Date(start_time).getTime())) {

      return res.status(400).json({
        error: "Please choose a valid time"
      });

    }

    if (title && title.length > MAX_TITLE_LENGTH) {

      return res.status(400).json({
        error: "Title is too long"
      });

    }

    if (notes && notes.length > MAX_NOTES_LENGTH) {

      return res.status(400).json({
        error: "Notes are too long"
      });

    }

    const business = await getBusinessBySlug(req.params.slug);

    if (!business) {

      return res.status(404).json({
        error: "We couldn't find that business"
      });

    }

    if (!business.business_hours) {

      return res.status(400).json({
        error: "Online booking isn't set up for this business yet"
      });

    }

    const { id: customerId } = await findOrCreateCustomer(business.id, name, email, phone);

    const appointmentTitle = title && title.trim() ? title.trim() : "Appointment request";

    // The availability re-check and the appointment insert happen as one
    // atomic unit here (see createAppointmentIfSlotAvailable's own
    // comment) - a plain separate "check, then insert" left a real
    // window for two visitors booking the same popular slot at once to
    // both pass the check before either write landed.
    const result = await createAppointmentIfSlotAvailable(

      business,
      start_time,
      duration_minutes,
      [
        business.id,
        customerId,
        appointmentTitle,
        notes || null,
        start_time,
        null,
        "requested"
      ]

    );

    if (result.error === "slot_taken") {

      return res.status(409).json({
        error: "That time was just booked or is no longer available. Please choose another."
      });

    }

    const appointmentId = result.appointmentId;

    // Best-effort, same reasoning as every other public-facing
    // notification in this file - a stranger's booking must never fail
    // to save just because the owner's notification couldn't be created.
    try {

      await createNotification(

        business.id,

        "appointment_requested",

        `📅 ${name.trim()} booked an appointment online`,

        appointmentTitle,

        "/schedule"

      );

    } catch (notificationError) {

      console.error("PUBLIC BOOKING NOTIFICATION FAILED:", notificationError);

    }

    res.status(201).json({
      id: appointmentId,
      message: "Appointment requested"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



module.exports = {

  getBusinessBySlugHandler,

  startConversation,

  sendPublicMessage,

  getPublicHistory,

  getPublicAvailability,

  createPublicBooking

};
