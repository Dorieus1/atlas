const { getCustomerNotes } = require("./noteService");
const { getAppointmentsByCustomer } = require("./appointmentService");
const { getQuotesByCustomer, formatQuoteNumber } = require("./quoteService");
const { getPhotosByCustomer } = require("./photoService");
const { getReviewRequestsByCustomer } = require("./reviewRequestService");


// Merges every dated thing tied to a customer - notes, appointments,
// quotes/invoices, photos, review requests, plus the customer's own
// creation - into one chronologically-sorted feed, replacing what used
// to be a handful of disconnected cards (a separate Notes card, a
// separate Appointment History card, no visibility into quotes/photos/
// review requests at all) with a single story of the relationship.
//
// Deliberately built on the SAME per-customer service functions the rest
// of the app already calls (getCustomerNotes, getAppointmentsByCustomer,
// getQuotesByCustomer, getPhotosByCustomer, getReviewRequestsByCustomer)
// rather than new SQL - a quote's total still comes from quoteService's
// own applyDiscount, so there's exactly one definition of each entity's
// shape, not a second one drifting here. Returns raw fields (not
// pre-formatted display strings) so the frontend composes text/icons per
// type the same way it already does for quotes, appointments, etc.
const getCustomerTimeline = async (customer, business_id) => {

  const [notes, appointments, quotes, photos, reviewRequests] = await Promise.all([

    getCustomerNotes(customer.id),
    getAppointmentsByCustomer(customer.id, business_id),
    getQuotesByCustomer(customer.id, business_id),
    getPhotosByCustomer(customer.id, business_id),
    getReviewRequestsByCustomer(customer.id, business_id)

  ]);

  const events = [];

  events.push({
    type: "customer_created",
    id: `customer-${customer.id}`,
    date: customer.created_at,
    createdByName: customer.created_by_name || null
  });

  notes.forEach((note) => {

    events.push({
      type: "note",
      id: note.id,
      date: note.created_at,
      note: note.note
    });

  });

  appointments.forEach((appt) => {

    events.push({
      type: "appointment",
      id: appt.id,
      date: appt.start_time,
      title: appt.title,
      status: appt.status
    });

  });

  quotes.forEach((quote) => {

    events.push({
      type: "quote",
      id: quote.id,
      date: quote.created_at,
      quoteType: quote.type,
      status: quote.status,
      total: quote.total,
      quoteNumberFormatted: formatQuoteNumber(quote.type, quote.quote_number)
    });

  });

  photos.forEach((photo) => {

    events.push({
      type: "photo",
      id: photo.id,
      date: photo.created_at,
      caption: photo.caption || null,
      photoUrl: `/uploads/photos/${photo.filename}`
    });

  });

  reviewRequests.forEach((request) => {

    events.push({
      type: "review_request",
      id: request.id,
      date: request.created_at,
      sentTo: request.sent_to
    });

  });

  events.sort((a, b) => new Date(b.date) - new Date(a.date));

  return events;

};


module.exports = {
  getCustomerTimeline
};
