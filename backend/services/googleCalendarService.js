const { google } = require("googleapis");
const jwt = require("jsonwebtoken");


// Matches DEFAULT_DURATION_MS in appointmentService.js - an appointment
// with no explicit end_time gets a 1-hour block on the Google Calendar
// side too, the same convention appointmentService already uses for
// conflict detection.
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

// calendar.events (not the broader calendar.calendars/calendarList
// scopes) is the least Google Calendar access that can create/update/
// delete events on the business's primary calendar - this integration
// never needs to read or manage the business's other calendars.
const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

// Encoded into the OAuth state param below and checked back out of it in
// verifyState - identifies which purpose a state JWT was minted for, so a
// token from some other flow that happens to be signed with the same
// JWT_SECRET can never be replayed into this one.
const STATE_PURPOSE = "google_calendar_connect";

// Short-lived: a state token only needs to survive the few minutes
// between a business owner clicking "Connect Google Calendar" and Google
// redirecting back with a code.
const STATE_TTL = "10m";


// Lazily constructed so a business can be set up and used entirely
// without Google Calendar (no GOOGLE_CLIENT_ID/SECRET in .env) - only
// code paths that actually touch Google pay the cost of this throwing.
// Mirrors stripeService.js's getStripeClient() exactly.
function getOAuthClient() {

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {

    throw new Error("Google Calendar isn't set up yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file.");

  }

  return new google.auth.OAuth2(

    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI

  );

}



// Builds the URL the frontend redirects the owner's browser to in order
// to start the Google consent flow. `business_id` is encoded into the
// OAuth `state` parameter as a short-lived, signed JWT (same JWT_SECRET
// already used for login sessions) rather than relying on a session
// cookie - Google's redirect back to /callback below is a plain browser
// navigation with no Authorization header, so `state` is the only thing
// that ties that request back to a specific business. Being signed means
// the callback can trust the business_id it decodes without a DB lookup
// or any other correlation step, and a tampered/forged state value fails
// verification instead of silently connecting the wrong business's
// calendar.
const getAuthUrl = (business_id) => {

  const oauth2Client = getOAuthClient();

  const state = jwt.sign(

    { business_id, purpose: STATE_PURPOSE },
    process.env.JWT_SECRET,
    { expiresIn: STATE_TTL }

  );

  return oauth2Client.generateAuthUrl({

    // "offline" is what makes Google actually issue a refresh token -
    // without it, the exchange below only returns a short-lived access
    // token and there'd be nothing to persist for future syncing.
    access_type: "offline",

    // Forces the consent screen every time, even for a Google account
    // that has already authorized this app before. Without this, a
    // business that disconnects and reconnects the same Google account
    // often gets silently skipped past consent and Google omits the
    // refresh token on that second exchange (it only reliably issues one
    // on a fresh grant) - "consent" guarantees reconnecting always yields
    // a usable refresh token.
    prompt: "consent",

    scope: SCOPES,

    state

  });

};



// Decodes and verifies a state param from the callback, returning the
// business_id it was minted for. Throws if the signature is invalid, it's
// expired, or it wasn't minted by getAuthUrl above.
const verifyState = (state) => {

  const decoded = jwt.verify(state, process.env.JWT_SECRET);

  if (decoded.purpose !== STATE_PURPOSE || !decoded.business_id) {

    throw new Error("Invalid Google Calendar connection state");

  }

  return decoded.business_id;

};



// Exchanges the one-time `code` Google's redirect included for a
// long-lived refresh token, plus the connected account's email (fetched
// via Google's own userinfo endpoint rather than trying to decode the ID
// token by hand). Throws if Google doesn't return a refresh token at all
// - callers already send prompt: "consent" above specifically to avoid
// this, but it can still happen if GOOGLE_CLIENT_ID/SECRET are wrong.
const exchangeCodeForTokens = async (code) => {

  const oauth2Client = getOAuthClient();

  let tokens;

  try {

    ({ tokens } = await oauth2Client.getToken(code));

  } catch (error) {

    throw new Error(`Couldn't complete the Google Calendar connection: ${error.message}`);

  }

  if (!tokens || !tokens.refresh_token) {

    throw new Error("Google didn't return a refresh token. Try disconnecting and reconnecting Google Calendar.");

  }

  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });

  let email = null;

  try {

    const { data } = await oauth2.userinfo.get();
    email = data && data.email ? data.email : null;

  } catch (error) {

    // The refresh token is the part that actually matters for syncing -
    // not knowing the connected email yet shouldn't fail the whole
    // connection. It'll just show as connected without an email in the UI.
    console.error("GOOGLE CALENDAR USERINFO FAILED:", error);

  }

  return { refreshToken: tokens.refresh_token, email };

};



// Builds an authorized client from a stored refresh token. googleapis
// automatically exchanges this for a fresh access token (and re-uses/
// refreshes it as needed) on the first authenticated request made with
// this client - no manual token refresh logic needed here.
function getAuthorizedClient(refreshToken) {

  const oauth2Client = getOAuthClient();

  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return oauth2Client;

}



// Google Calendar's Events resource wants ISO 8601 dateTime strings, not
// bare dates - appointment.start_time/end_time are already ISO strings
// throughout this codebase (see appointmentService.js), so this just
// fills in a default end_time when none was set.
function toEventRequestBody(appointment) {

  const start = new Date(appointment.start_time);

  const end = appointment.end_time
    ? new Date(appointment.end_time)
    : new Date(start.getTime() + DEFAULT_DURATION_MS);

  return {

    summary: appointment.title,
    description: appointment.notes || undefined,

    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() }

  };

}



// True when a Google API/auth-library error means the stored refresh
// token itself is no longer usable (the owner revoked Atlas's access,
// or the token was reset on Google's side) rather than some transient
// or one-off failure. Checked against every shape these libraries
// actually throw: googleapis sets a numeric `code`, google-auth-library
// puts the OAuth error name in `response.data.error` when a refresh
// fails, and some paths only ever surface it in the message text.
function isAuthError(error) {

  if (error.code === 401 || error.response?.status === 401) {
    return true;
  }

  const oauthError = error.response?.data?.error;

  if (oauthError === "invalid_grant" || oauthError === "invalid_token") {
    return true;
  }

  return /invalid_grant|invalid credentials/i.test(error.message || "");

}


// Creates an event on the business's primary Google Calendar for a newly
// created appointment. Returns the created event's id, which callers are
// expected to persist (appointments.google_event_id) so later updates/
// deletes touch the right event. Throws clearly on failure - never
// crashes unhandled - callers (appointmentService.js) are responsible for
// catching this and logging, since a Google failure must never affect the
// appointment operation itself. The thrown error carries `isAuthError`
// so callers can tell "Google had a bad moment" apart from "this
// business's connection is dead and needs reconnecting."
const createCalendarEvent = async (refreshToken, appointment) => {

  try {

    const auth = getAuthorizedClient(refreshToken);
    const calendar = google.calendar({ version: "v3", auth });

    const { data } = await calendar.events.insert({

      calendarId: "primary",
      requestBody: toEventRequestBody(appointment)

    });

    return data.id;

  } catch (error) {

    const wrapped = new Error(`Couldn't create the Google Calendar event: ${error.message}`);
    wrapped.isAuthError = isAuthError(error);
    throw wrapped;

  }

};



const updateCalendarEvent = async (refreshToken, googleEventId, appointment) => {

  try {

    const auth = getAuthorizedClient(refreshToken);
    const calendar = google.calendar({ version: "v3", auth });

    const { data } = await calendar.events.update({

      calendarId: "primary",
      eventId: googleEventId,
      requestBody: toEventRequestBody(appointment)

    });

    return data.id;

  } catch (error) {

    const wrapped = new Error(`Couldn't update the Google Calendar event: ${error.message}`);
    wrapped.isAuthError = isAuthError(error);
    throw wrapped;

  }

};



const deleteCalendarEvent = async (refreshToken, googleEventId) => {

  try {

    const auth = getAuthorizedClient(refreshToken);
    const calendar = google.calendar({ version: "v3", auth });

    await calendar.events.delete({

      calendarId: "primary",
      eventId: googleEventId

    });

  } catch (error) {

    const wrapped = new Error(`Couldn't delete the Google Calendar event: ${error.message}`);
    wrapped.isAuthError = isAuthError(error);
    throw wrapped;

  }

};



module.exports = {

  getAuthUrl,

  verifyState,

  exchangeCodeForTokens,

  createCalendarEvent,

  updateCalendarEvent,

  deleteCalendarEvent

};
