const crypto = require("crypto");

const db = require("../../database/db");
const { icsEscape, toICalDate } = require("./icsUtils");

// Matches DEFAULT_DURATION_MS elsewhere (appointmentService.js,
// googleCalendarService.js, appleCalendarService.js) - an appointment
// with no explicit end_time gets a 1-hour block here too.
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

// How far back a subscribed calendar app still sees - just enough that
// "yesterday's job that ran a little late" doesn't vanish from the feed
// the moment it starts, without the feed growing forever as old
// appointments pile up.
const FEED_LOOKBACK_MS = 24 * 60 * 60 * 1000;


const getAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

};


const allAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

};


const runAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });

};


// 32 random bytes (256 bits) as hex - the token IS the auth for the
// public feed endpoint (see calendarFeedController.js), the same
// "long random string in the URL" model Google Calendar's own "secret
// address" feeds use, so it needs to be as unguessable as a real
// credential, not just an id.
function generateToken() {

  return crypto.randomBytes(32).toString("hex");

}


// Returns the business's existing feed token, minting one on first use
// rather than at business creation - a business that never opens this
// feature in Settings never has a live, guessable-by-brute-force-space
// URL sitting unused in the database.
const getOrCreateFeedToken = async (business_id) => {

  const business = await getAsync(`SELECT calendar_feed_token FROM businesses WHERE id = ?`, [business_id]);

  if (business?.calendar_feed_token) {
    return business.calendar_feed_token;
  }

  const token = generateToken();

  await runAsync(`UPDATE businesses SET calendar_feed_token = ? WHERE id = ?`, [token, business_id]);

  return token;

};


// Issues a brand new token, invalidating the old URL immediately - the
// only way to react to a leaked feed link, since (unlike a password)
// there's no separate credential behind it to rotate.
const regenerateFeedToken = async (business_id) => {

  const token = generateToken();

  await runAsync(`UPDATE businesses SET calendar_feed_token = ? WHERE id = ?`, [token, business_id]);

  return token;

};


const getBusinessByFeedToken = (token) => {

  return getAsync(`SELECT id, name FROM businesses WHERE calendar_feed_token = ?`, [token]);

};


function buildEventBlock(appointment) {

  const start = new Date(appointment.start_time);

  const end = appointment.end_time
    ? new Date(appointment.end_time)
    : new Date(start.getTime() + DEFAULT_DURATION_MS);

  const lines = [

    "BEGIN:VEVENT",
    // Same UID convention as appleCalendarService.js - if a business
    // later also connects Apple Calendar directly, the two feeds
    // describe the same event under the same UID rather than looking
    // like two unrelated ones to a calendar app that sees both.
    `UID:${appointment.id}@atlas.app`,
    `DTSTAMP:${toICalDate(new Date())}`,
    `DTSTART:${toICalDate(start)}`,
    `DTEND:${toICalDate(end)}`,
    `SUMMARY:${icsEscape(appointment.title)}`

  ];

  if (appointment.customer_name) {
    lines.push(`DESCRIPTION:${icsEscape(`Customer: ${appointment.customer_name}`)}`);
  }

  lines.push("END:VEVENT");

  return lines.join("\r\n");

}


// The feed itself - every appointment from FEED_LOOKBACK_MS ago
// onward, regardless of status, since a subscribed calendar app has no
// concept of "requested" vs "scheduled" and the owner benefits more
// from seeing everything on their actual calendar than from a feed
// that silently drops rows.
const buildIcsFeed = async (business_id, businessName) => {

  const cutoff = new Date(Date.now() - FEED_LOOKBACK_MS).toISOString();

  const appointments = await allAsync(

    `
    SELECT
      appointments.id,
      appointments.title,
      appointments.start_time,
      appointments.end_time,
      customers.name AS customer_name
    FROM appointments
    LEFT JOIN customers ON customers.id = appointments.customer_id
    WHERE appointments.business_id = ?
    AND appointments.start_time >= ?
    ORDER BY appointments.start_time ASC
    `,

    [business_id, cutoff]

  );

  const lines = [

    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Atlas//Calendar Feed//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsEscape(businessName ? `${businessName} - Atlas Schedule` : "Atlas Schedule")}`,
    ...appointments.map(buildEventBlock),
    "END:VCALENDAR"

  ];

  return lines.join("\r\n");

};


module.exports = {

  getOrCreateFeedToken,

  regenerateFeedToken,

  getBusinessByFeedToken,

  buildIcsFeed

};
