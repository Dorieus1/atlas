const { getBusinessById, setStripeAccountId, setStripeOnboarded } = require("../services/businessService");

const {
  createConnectAccount,
  createAccountLink,
  getAccountStatus
} = require("../services/stripeService");


const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";


const startOnboarding = async (req, res) => {

  try {

    const business = await getBusinessById(req.user.business_id);

    if (!business) {

      return res.status(404).json({
        error: "Business not found"
      });

    }

    let stripeAccountId = business.stripe_account_id;

    if (!stripeAccountId) {

      stripeAccountId = await createConnectAccount(business);
      await setStripeAccountId(business.id, stripeAccountId);

    }

    const url = await createAccountLink(

      stripeAccountId,
      `${FRONTEND_URL}/settings?stripe=refresh`,
      `${FRONTEND_URL}/settings?stripe=return`

    );

    res.json({ url });

  } catch (error) {

    console.error("STRIPE ONBOARDING ERROR:", error);

    res.status(500).json({
      error: error.message || "Couldn't start Stripe setup. Please try again."
    });

  }

};



const getConnectStatus = async (req, res) => {

  try {

    const business = await getBusinessById(req.user.business_id);

    if (!business) {

      return res.status(404).json({
        error: "Business not found"
      });

    }

    if (!business.stripe_account_id) {

      return res.json({
        connected: false,
        onboarded: false
      });

    }

    const { chargesEnabled, detailsSubmitted } = await getAccountStatus(business.stripe_account_id);
    const onboarded = chargesEnabled && detailsSubmitted;

    if (onboarded !== !!business.stripe_onboarded) {
      await setStripeOnboarded(business.id, onboarded);
    }

    res.json({
      connected: true,
      onboarded
    });

  } catch (error) {

    console.error("STRIPE STATUS ERROR:", error);

    res.status(500).json({
      error: error.message || "Couldn't check your Stripe status. Please try again."
    });

  }

};



module.exports = {

  startOnboarding,

  getConnectStatus

};
