const {
  getBusinessById,
  setAppleCalendarConnection,
  clearAppleCalendarConnection
} = require("../services/businessService");

const { discoverCalendarUrl } = require("../services/appleCalendarService");


// Owner-gated (see routes/appleCalendar.js). Unlike Google, there's no
// redirect/consent screen - the owner enters their Apple ID email and an
// app-specific password (generated at appleid.apple.com, never their
// real Apple ID password) directly into Atlas, and this runs the actual
// CalDAV discovery walk against iCloud right here, synchronously, so a
// wrong email/password is reported back immediately instead of being
// stored and only discovered on the next appointment sync.
const connect = async (req, res) => {

  const { email, app_password } = req.body;

  if (!email || !String(email).trim() || !app_password || !String(app_password).trim()) {

    return res.status(400).json({
      error: "An Apple ID email and app-specific password are both required."
    });

  }

  try {

    const business = await getBusinessById(req.user.business_id);

    if (!business) {

      return res.status(404).json({
        error: "Business not found"
      });

    }

    const calendarUrl = await discoverCalendarUrl(email.trim(), app_password.trim());

    await setAppleCalendarConnection(business.id, email.trim(), app_password.trim(), calendarUrl);

    res.json({
      connected: true,
      email: email.trim()
    });

  } catch (error) {

    console.error("APPLE CALENDAR CONNECT ERROR:", error);

    // 400, not 401: this is Apple rejecting a third-party credential the
    // owner just typed into this form, not Atlas's own session token
    // being invalid - the frontend's request() helper treats ANY 401
    // while a token is present as "your Atlas session expired" and force
    // logs the user out (see handleSessionExpired in atlasApi.js), which
    // would otherwise boot the owner out of Atlas entirely just for
    // mistyping an Apple ID password.
    res.status(error.isAuthError ? 400 : 500).json({

      error: error.isAuthError
        ? "Apple rejected that email or app-specific password. Double check both and try again."
        : (error.message || "Couldn't connect to Apple Calendar. Please try again.")

    });

  }

};



// Available to any logged-in user (owner or staff) - read-only, matches
// googleCalendarController.getStatus.
const getStatus = async (req, res) => {

  try {

    const business = await getBusinessById(req.user.business_id);

    if (!business) {

      return res.status(404).json({
        error: "Business not found"
      });

    }

    res.json({
      connected: !!business.apple_calendar_connected,
      email: business.apple_calendar_connected ? business.apple_calendar_email : null
    });

  } catch (error) {

    console.error("APPLE CALENDAR STATUS ERROR:", error);

    res.status(500).json({
      error: error.message || "Couldn't check your Apple Calendar status. Please try again."
    });

  }

};



// Owner-gated. Clears the stored connection - does not (and cannot)
// revoke the app-specific password itself; the owner can do that anytime
// from appleid.apple.com, same as revoking any other app password.
const disconnect = async (req, res) => {

  try {

    await clearAppleCalendarConnection(req.user.business_id);

    res.json({
      message: "Apple Calendar disconnected"
    });

  } catch (error) {

    console.error("APPLE CALENDAR DISCONNECT ERROR:", error);

    res.status(500).json({
      error: error.message || "Couldn't disconnect Apple Calendar. Please try again."
    });

  }

};



module.exports = {

  connect,

  getStatus,

  disconnect

};
