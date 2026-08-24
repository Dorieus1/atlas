const Stripe = require("stripe");

// Lazily constructed so a business can be set up and used entirely
// without payments (no STRIPE_SECRET_KEY in .env) - only code paths that
// actually touch Stripe pay the cost of this throwing.
let stripeClient = null;

function getStripeClient() {

  if (!process.env.STRIPE_SECRET_KEY) {

    throw new Error("Online payments aren't set up yet. Add STRIPE_SECRET_KEY to your .env file.");

  }

  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }

  return stripeClient;

}


// Standard Connect account: the business owns and controls this Stripe
// account directly (their own dashboard, their own bank account, their
// own tax/compliance responsibility). Atlas only ever facilitates the
// connection and never touches the money - every charge created against
// this account is a *direct* charge, so funds land with the business
// immediately rather than passing through a platform-owned account.
const createConnectAccount = async (business) => {

  const stripe = getStripeClient();

  const account = await stripe.accounts.create({

    type: "standard",

    business_profile: {
      name: business.name
    }

  });

  return account.id;

};



const createAccountLink = async (stripeAccountId, refreshUrl, returnUrl) => {

  const stripe = getStripeClient();

  const link = await stripe.accountLinks.create({

    account: stripeAccountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding"

  });

  return link.url;

};



const getAccountStatus = async (stripeAccountId) => {

  const stripe = getStripeClient();

  const account = await stripe.accounts.retrieve(stripeAccountId);

  return {
    chargesEnabled: !!account.charges_enabled,
    detailsSubmitted: !!account.details_submitted
  };

};



// A direct charge on the connected account: created "as" that account
// (via the stripeAccount option), so Stripe settles the funds straight
// into the business's own balance, not the platform's.
const createCheckoutSession = async (

  stripeAccountId,
  items,
  successUrl,
  cancelUrl,
  metadata

) => {

  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create(

    {

      mode: "payment",

      line_items: items.map((item) => ({

        price_data: {
          currency: "usd",
          product_data: { name: item.description.slice(0, 250) },
          unit_amount: Math.round(item.unit_price * 100)
        },

        quantity: item.quantity

      })),

      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata

    },

    {
      stripeAccount: stripeAccountId
    }

  );

  return { id: session.id, url: session.url };

};



const constructWebhookEvent = (rawBody, signature) => {

  const stripe = getStripeClient();

  if (!process.env.STRIPE_CONNECT_WEBHOOK_SECRET) {

    throw new Error("STRIPE_CONNECT_WEBHOOK_SECRET is not set");

  }

  return stripe.webhooks.constructEvent(

    rawBody,
    signature,
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET

  );

};



module.exports = {

  createConnectAccount,

  createAccountLink,

  getAccountStatus,

  createCheckoutSession,

  constructWebhookEvent

};
