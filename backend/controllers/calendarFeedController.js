const {
  getOrCreateFeedToken,
  regenerateFeedToken,
  getBusinessByFeedToken,
  buildIcsFeed
} = require("../services/calendarFeedService");


// Available to any logged-in user (owner or staff) - matches
// googleCalendarController.getStatus and appleCalendarController.getStatus:
// viewing/copying the feed URL is read-only, only regenerating it is
// owner-gated below. Returns just the token (not a full URL) - the
// frontend already knows its own API base (see atlasApi.js's API_BASE)
// and builds the full link from it, the same way it builds the public
// chat/portal links.
const getFeedToken = async (req, res) => {

  try {

    const token = await getOrCreateFeedToken(req.user.business_id);

    res.json({ token });

  } catch (error) {

    console.error("CALENDAR FEED TOKEN ERROR:", error);

    res.status(500).json({
      error: error.message || "Couldn't get your calendar feed link. Please try again."
    });

  }

};



// Owner-gated. Issues a fresh token, immediately invalidating whatever
// URL was out there before - the only real response to a leaked feed
// link, since there's no separate credential behind it to rotate.
const regenerateFeed = async (req, res) => {

  try {

    const token = await regenerateFeedToken(req.user.business_id);

    res.json({ token });

  } catch (error) {

    console.error("CALENDAR FEED REGENERATE ERROR:", error);

    res.status(500).json({
      error: error.message || "Couldn't reset your calendar feed link. Please try again."
    });

  }

};



// Hit directly by calendar apps (Apple Calendar, Google Calendar,
// Outlook, etc.) subscribing "by URL" - not an authenticated frontend
// call, and deliberately so: most calendar apps have no way to send a
// Bearer token when polling a subscribed feed. The token in the URL
// itself is what stands in for auth here, the same model Google
// Calendar's own "secret address" ICS feeds use.
const getFeed = async (req, res) => {

  try {

    const { token } = req.params;

    const business = await getBusinessByFeedToken(token);

    if (!business) {

      return res.status(404).send("Calendar feed not found.");

    }

    const ics = await buildIcsFeed(business.id, business.name);

    res.set("Content-Type", "text/calendar; charset=utf-8");
    res.send(ics);

  } catch (error) {

    console.error("CALENDAR FEED ERROR:", error);

    res.status(500).send("Couldn't load the calendar feed.");

  }

};



module.exports = {

  getFeedToken,

  regenerateFeed,

  getFeed

};
