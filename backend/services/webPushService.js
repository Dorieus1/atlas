const webpush = require("web-push");
const { getSubscriptionsForBusiness, deleteSubscription } = require("./pushSubscriptionService");


// VAPID keys let browsers' push services (Google/Mozilla/Apple's own free
// endpoints) verify that pushes actually came from Atlas, without Atlas
// needing a paid account with any of them. Self-generated once, stored in
// .env - see project memory for how these were created.
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {

  webpush.setVapidDetails(

    process.env.VAPID_SUBJECT || "mailto:support@atlas.app",

    process.env.VAPID_PUBLIC_KEY,

    process.env.VAPID_PRIVATE_KEY

  );

}


// Fans a single notification out to every device subscribed for this
// business. Deliberately best-effort per-subscription: one dead device
// (uninstalled app, cleared browser data, expired subscription) must
// never stop the notification from reaching every other device, and must
// never bubble an error up into whatever business-logic flow triggered
// the notification in the first place (booking a job, receiving a lead,
// etc.) - this mirrors how email-sending and calendar-sync failures are
// already treated elsewhere in this codebase as "best effort" side
// effects, not steps the main action depends on.
const sendPushToBusiness = async (business_id, payload) => {

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return;
  }

  let subscriptions;

  try {

    subscriptions = await getSubscriptionsForBusiness(business_id);

  } catch (err) {

    console.error("Failed to load push subscriptions:", err.message);

    return;

  }

  if (!subscriptions || subscriptions.length === 0) {
    return;
  }

  const body = JSON.stringify(payload);

  await Promise.all(

    subscriptions.map(async (sub) => {

      try {

        await webpush.sendNotification(

          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
          },

          body

        );

      } catch (err) {

        // 404/410 mean the browser's push service has permanently
        // discarded this subscription (uninstalled, cleared data,
        // expired) - keeping it around would just fail forever, so
        // clean it up. Any other error (network blip, etc.) is left
        // alone to retry on the next real notification.
        if (err.statusCode === 404 || err.statusCode === 410) {

          deleteSubscription(sub.endpoint).catch(() => {});

        } else {

          console.error("Push send failed:", err.message);

        }

      }

    })

  );

};


module.exports = {

  sendPushToBusiness

};
