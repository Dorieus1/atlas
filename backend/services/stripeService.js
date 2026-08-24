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


// The v2 Accounts API's equivalent of a v1 "Standard" account: dashboard
// "full" means the business gets their own complete Stripe dashboard and
// owns/controls the account directly, and responsibilities.fees_collector/
// losses_collector: "stripe" means Stripe (not Atlas) is the party on the
// hook for that account's fees and disputes. Country/business details are
// deliberately left out here - Stripe's own hosted onboarding link (below)
// collects those from the business directly, same as it always has.
// Atlas only ever facilitates the connection and never touches the money -
// every charge created against this account is a *direct* charge (see
// createCheckoutSession), so funds land with the business immediately
// rather than passing through a platform-owned account.
const createConnectAccount = async (business) => {

  const stripe = getStripeClient();

  // Stripe requires identity.country up front to grant the merchant
  // (card_payments) configuration - it can't be deferred to the hosted
  // onboarding flow the way v1 Standard accounts allowed. The rest of
  // this app already assumes US/USD throughout (pricing, formatMoney,
  // checkout currency), so hardcoding US here is a known simplification
  // consistent with that, not a new limitation - genuine multi-country
  // support would need a country picker here plus currency handling
  // throughout quotes/analytics/checkout, which is a separate project.
  const account = await stripe.v2.core.accounts.create({

    display_name: business.name,

    ...(business.email ? { contact_email: business.email } : {}),

    dashboard: "full",

    identity: {
      country: "us"
    },

    configuration: {
      merchant: {
        capabilities: {
          card_payments: { requested: true }
        }
      }
    },

    defaults: {
      currency: "usd",
      responsibilities: {
        fees_collector: "stripe",
        losses_collector: "stripe"
      }
    }

  });

  return account.id;

};



// accountLinks (onboarding) and accounts.retrieve (status) are still v1
// endpoints, but Stripe's v2 migration docs confirm v1 endpoints accept a
// v2 account id directly and respond in v1's shape - no v2 equivalent
// needed for either of these.
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
