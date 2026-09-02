const {
  saveSubscription,
  deleteSubscription
} = require("../services/pushSubscriptionService");



// The public VAPID key is safe to hand to any logged-in team member's
// browser - it's the private half that has to stay server-side. The
// frontend needs it to call the browser's own PushManager.subscribe().
const getPublicKey = (req, res) => {

  if (!process.env.VAPID_PUBLIC_KEY) {

    return res.status(503).json({
      error: "Push notifications aren't configured on this server."
    });

  }

  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });

};



const subscribe = async (req, res) => {

  try {

    const { subscription } = req.body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {

      return res.status(400).json({
        error: "A valid push subscription is required."
      });

    }

    await saveSubscription(req.user.business_id, req.user.id, subscription);

    res.json({ message: "Subscribed" });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const unsubscribe = async (req, res) => {

  try {

    const { endpoint } = req.body;

    if (!endpoint) {

      return res.status(400).json({
        error: "An endpoint is required."
      });

    }

    await deleteSubscription(endpoint);

    res.json({ message: "Unsubscribed" });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



module.exports = {

  getPublicKey,

  subscribe,

  unsubscribe

};
