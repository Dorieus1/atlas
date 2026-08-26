const { constructWebhookEvent } = require("../services/stripeService");
const { markQuotePaid, markQuoteDepositPaid, notifyQuotePaymentFailed } = require("../services/quotePaymentService");


// No auth here - Stripe calls this directly. The signature check below is
// what proves a request genuinely came from Stripe instead of anyone who
// found the URL; req.body must be the raw, unparsed bytes for that check
// to work; see the express.raw() wiring in server.js.
const handleStripeWebhook = async (req, res) => {

  let event;

  try {

    event = constructWebhookEvent(req.body, req.headers["stripe-signature"]);

  } catch (error) {

    console.error("STRIPE WEBHOOK SIGNATURE ERROR:", error.message);

    return res.status(400).json({
      error: "Invalid signature"
    });

  }

  try {

    if (event.type === "checkout.session.completed") {

      const session = event.data.object;
      const { quote_id, business_id, payment_type } = session.metadata || {};

      if (quote_id && business_id) {

        // A deposit Checkout Session is tagged payment_type: 'deposit' in
        // its metadata (see portalController.createDepositCheckout); any
        // other value - including a session created before this field
        // existed, which simply won't have it - is the existing full
        // invoice/quote payment flow and must behave exactly as before.
        if (payment_type === "deposit") {

          await markQuoteDepositPaid(quote_id, business_id);

        } else {

          await markQuotePaid(quote_id, business_id);

        }

      }

    }

    // A delayed payment method (e.g. ACH) failing after the customer has
    // already left the portal - the owner has no other way to find out,
    // since nothing on the customer's end surfaces this back to them
    // either. Deliberately doesn't touch the quote's status - see the
    // comment on notifyQuotePaymentFailed.
    if (event.type === "checkout.session.async_payment_failed") {

      const session = event.data.object;
      const { quote_id, business_id } = session.metadata || {};

      if (quote_id && business_id) {

        await notifyQuotePaymentFailed(quote_id, business_id);

      }

    }

    res.json({ received: true });

  } catch (error) {

    console.error("STRIPE WEBHOOK HANDLING ERROR:", error);

    // Still 200 - Stripe retries on non-2xx, and retrying won't fix a
    // bug in our own handling. Logging it is what actually matters here.
    res.json({ received: true });

  }

};


module.exports = {
  handleStripeWebhook
};
