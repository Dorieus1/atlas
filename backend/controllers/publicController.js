const { getBusinessBySlug } = require("../services/businessService");
const { createCustomer, getCustomerById } = require("../services/customerService");
const { getConversationHistory } = require("../services/conversationService");
const { processChatMessage } = require("../services/chatService");
const { createNotification } = require("../services/notificationService");
const { getAvailability, createAppointmentIfSlotAvailable, DEFAULT_DURATION_MINUTES } = require("../services/availabilityService");


const MAX_NAME_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_TITLE_LENGTH = 200;
const MAX_NOTES_LENGTH = 2000;


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

    const customerId = await createCustomer(

      business.id,

      name.trim(),

      email || null,

      phone || null

    );

    // Best-effort - a stranger reaching out through the public chat page
    // is worth flagging, but a failure here must never block them from
    // actually starting the conversation.
    try {

      await createNotification(

        business.id,

        "new_conversation",

        `💬 ${name.trim()} started a chat`,

        "New visitor from your public chat page",

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

    const customer = await getCustomerById(customer_id, business.id);

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

    const customer = await getCustomerById(customer_id, business.id);

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
// looking at the same page at once. Creates a fresh customer every
// time, same as startConversation above already does for the public
// chat - deduping a repeat visitor by email is what the existing
// duplicate-detection/merge feature is for, not something this endpoint
// should try to guess at.
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

    const customerId = await createCustomer(

      business.id,

      name.trim(),

      email || null,

      phone || null

    );

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
