const { getBusinessById, setGoogleCalendarConnection, clearGoogleCalendarConnection } = require("../services/businessService");

const {
  getAuthUrl,
  verifyState,
  exchangeCodeForTokens
} = require("../services/googleCalendarService");


const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";


// Owner-gated (see routes/googleCalendar.js) - returns the Google consent
// URL for the frontend to redirect the browser to, same shape as
// stripeConnectController.startOnboarding returning { url }.
const startConnect = async (req, res) => {

  try {

    const business = await getBusinessById(req.user.business_id);

    if (!business) {

      return res.status(404).json({
        error: "Business not found"
      });

    }

    const url = getAuthUrl(business.id);

    res.json({ url });

  } catch (error) {

    console.error("GOOGLE CALENDAR CONNECT ERROR:", error);

    res.status(500).json({
      error: error.message || "Couldn't start connecting Google Calendar. Please try again."
    });

  }

};



// Hit directly by Google's redirect after the owner grants (or denies)
// consent - NOT an authenticated API call from the frontend, so there's
// no req.user here. The business is identified entirely from the signed
// `state` param minted in getAuthUrl above. Always ends in a redirect
// back to the frontend Settings page (success or failure) rather than a
// JSON response, since the browser lands here directly.
const handleCallback = async (req, res) => {

  const { code, state, error: googleError } = req.query;

  if (googleError || !code || !state) {

    return res.redirect(`${FRONTEND_URL}/settings?google_calendar=error`);

  }

  let business_id;

  try {

    business_id = verifyState(state);

  } catch (stateError) {

    console.error("GOOGLE CALENDAR STATE VERIFICATION FAILED:", stateError);

    return res.redirect(`${FRONTEND_URL}/settings?google_calendar=error`);

  }

  try {

    const { refreshToken, email } = await exchangeCodeForTokens(code);

    await setGoogleCalendarConnection(business_id, refreshToken, email);

    res.redirect(`${FRONTEND_URL}/settings?google_calendar=connected`);

  } catch (error) {

    console.error("GOOGLE CALENDAR CALLBACK ERROR:", error);

    res.redirect(`${FRONTEND_URL}/settings?google_calendar=error`);

  }

};



// Available to any logged-in user (owner or staff) - matches
// stripeConnectController.getConnectStatus, which also has no
// requireOwner: checking status is read-only, only starting/stopping the
// connection is an owner-only action.
const getStatus = async (req, res) => {

  try {

    const business = await getBusinessById(req.user.business_id);

    if (!business) {

      return res.status(404).json({
        error: "Business not found"
      });

    }

    res.json({
      connected: !!business.google_calendar_connected,
      email: business.google_calendar_connected ? business.google_calendar_email : null
    });

  } catch (error) {

    console.error("GOOGLE CALENDAR STATUS ERROR:", error);

    res.status(500).json({
      error: error.message || "Couldn't check your Google Calendar status. Please try again."
    });

  }

};



// Owner-gated. Clears the stored connection - does not revoke the token
// with Google (see the comment on clearGoogleCalendarConnection).
const disconnect = async (req, res) => {

  try {

    await clearGoogleCalendarConnection(req.user.business_id);

    res.json({
      message: "Google Calendar disconnected"
    });

  } catch (error) {

    console.error("GOOGLE CALENDAR DISCONNECT ERROR:", error);

    res.status(500).json({
      error: error.message || "Couldn't disconnect Google Calendar. Please try again."
    });

  }

};



module.exports = {

  startConnect,

  handleCallback,

  getStatus,

  disconnect

};
