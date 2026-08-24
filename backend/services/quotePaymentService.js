const { getQuoteById, updateQuoteFields } = require("./quoteService");
const { getCustomerById } = require("./customerService");
const { getBusinessById } = require("./businessService");
const { sendReviewRequestForCustomer } = require("./reviewRequestService");


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


module.exports = {
  markQuotePaid
};
