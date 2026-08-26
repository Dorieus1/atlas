const { getQuoteById, updateQuoteFields, formatQuoteNumber } = require("./quoteService");
const { getCustomerById } = require("./customerService");
const { getBusinessById } = require("./businessService");
const { sendReviewRequestForCustomer } = require("./reviewRequestService");
const { createNotification } = require("./notificationService");


// Shared by the owner manually marking an invoice paid (quoteController)
// and the Stripe webhook firing when a customer pays online - both need
// the exact same idempotency guarantee (never re-fire the review-request
// automation on an invoice that's already paid) and the same "ask for a
// review" follow-up, so this is the one place that logic lives.
const markQuotePaid = async (quote_id, business_id) => {

  const before = await getQuoteById(quote_id, business_id);

  if (!before) {
    return { found: false, alreadyPaid: false, reviewRequestSent: false };
  }

  if (before.status === "paid") {
    return { found: true, alreadyPaid: true, reviewRequestSent: false };
  }

  await updateQuoteFields(quote_id, business_id, {
    status: "paid",
    paid_at: new Date().toISOString()
  });

  let reviewRequestSent = false;

  // Best-effort - a real send failure must never make the payment itself
  // look like it failed, and a quote (not an invoice) never triggers this.
  if (before.type === "invoice") {

    try {

      const customer = await getCustomerById(before.customer_id, business_id);
      const business = await getBusinessById(business_id);

      if (customer && business) {

        const result = await sendReviewRequestForCustomer(business, customer);
        reviewRequestSent = result.sent;

      }

    } catch (reviewError) {

      console.error("AUTO REVIEW REQUEST FAILED:", reviewError);

    }

  }

  return { found: true, alreadyPaid: false, reviewRequestSent };

};



// The deposit equivalent of markQuotePaid() above, shared by the Stripe
// webhook when a deposit Checkout Session completes. Deliberately does
// NOT touch status or paid_at - those stay reserved for the full
// invoice/quote payment, which is a completely separate event that may
// still be pending after a deposit lands. Idempotent the same way: a
// deposit that's already marked paid is a no-op, not a second
// notification.
const markQuoteDepositPaid = async (quote_id, business_id) => {

  const before = await getQuoteById(quote_id, business_id);

  if (!before) {
    return { found: false, alreadyPaid: false };
  }

  if (before.deposit_paid_at) {
    return { found: true, alreadyPaid: true };
  }

  await updateQuoteFields(quote_id, business_id, {
    deposit_paid_at: new Date().toISOString()
  });

  // Best-effort - same reasoning as the review-request send above: a
  // notification failure must never make the payment itself look like it
  // failed.
  try {

    const customer = await getCustomerById(before.customer_id, business_id);
    const numberPart = before.quote_number ? formatQuoteNumber(before.type, before.quote_number) : null;

    await createNotification(

      business_id,

      "deposit_paid",

      `💰 ${customer?.name || "A customer"} paid a deposit`,

      numberPart,

      "/quotes"

    );

  } catch (notificationError) {

    console.error("DEPOSIT PAID NOTIFICATION FAILED:", notificationError);

  }

  return { found: true, alreadyPaid: false };

};


// Fired when a Checkout Session's delayed payment method (e.g. ACH) ends
// up failing after the customer already left the portal - unlike a card
// declining, which the customer sees and can retry immediately, this
// failure happens completely out of band, so the owner is the only one
// in a position to notice unless something tells them. Never touches the
// quote's status: a failed attempt doesn't undo whatever the quote's
// current status already is, and the customer can simply try again.
const notifyQuotePaymentFailed = async (quote_id, business_id) => {
  const quote = await getQuoteById(quote_id, business_id);

  if (!quote) {
    return { found: false };
  }

  try {

    const customer = await getCustomerById(quote.customer_id, business_id);
    const numberPart = quote.quote_number ? formatQuoteNumber(quote.type, quote.quote_number) : null;

    await createNotification(

      business_id,

      "payment_failed",

      `⚠️ ${customer?.name || "A customer"}'s payment failed`,

      numberPart,

      "/quotes"

    );

  } catch (notificationError) {

    console.error("PAYMENT FAILED NOTIFICATION FAILED:", notificationError);

  }

  return { found: true };
};


module.exports = {
  markQuotePaid,
  markQuoteDepositPaid,
  notifyQuotePaymentFailed
};
