const { XMLParser } = require("fast-xml-parser");

// Apple has no OAuth API for Calendar - iCloud speaks CalDAV instead,
// authenticated with an "app-specific password" the user generates at
// appleid.apple.com specifically for third-party apps (never their real
// Apple ID password, and revocable independently of it). This service
// only ever talks to iCloud's own CalDAV endpoint - it isn't a generic
// CalDAV client for arbitrary servers.
const CALDAV_BASE = "https://caldav.icloud.com";

// Matches DEFAULT_DURATION_MS in appointmentService.js/googleCalendarService.js -
// an appointment with no explicit end_time gets a 1-hour block here too.
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: false, attributeNamePrefix: "@_" });


function asArray(value) {

  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];

}


function authHeader(email, appPassword) {

  return "Basic " + Buffer.from(`${email}:${appPassword}`).toString("base64");

}


// Every CalDAV call funnels through here so a wrong Apple ID/app-specific
// password (or one the owner has since revoked) is recognized the same
// way everywhere - callers check `.isAuthError` the same way
// googleCalendarService.js's callers check it for a revoked Google token.
async function davRequest(url, { method, email, appPassword, headers = {}, body }) {

  const res = await fetch(url, {

    method,

    headers: {
      Authorization: authHeader(email, appPassword),
      ...headers
    },

    body

  });

  if (res.status === 401) {

    const err = new Error("Apple rejected that Apple ID email or app-specific password.");
    err.isAuthError = true;
    throw err;

  }

  return res;

}


// Scans every <response>'s <propstat> blocks for one with a 200 status
// that actually carries the requested property - a PROPFIND response can
// report several properties per collection, each with its own status
// (some can 404 independently of others on the same resource).
function findProp(responses, propName) {

  for (const response of responses) {

    for (const propstat of asArray(response.propstat)) {

      if (!String(propstat.status || "").includes("200")) {
        continue;
      }

      const prop = propstat.prop;

      if (prop && prop[propName] !== undefined) {
        return prop[propName];
      }

    }

  }

  return undefined;

}


async function propfind(url, email, appPassword, propBody, depth) {

  const res = await davRequest(url, {

    method: "PROPFIND",
    email,
    appPassword,
    headers: { Depth: depth, "Content-Type": "application/xml; charset=utf-8" },
    body: propBody

  });

  if (res.status !== 207) {

    throw new Error(`Apple Calendar didn't respond as expected (status ${res.status}).`);

  }

  const xml = await res.text();
  const parsed = parser.parse(xml);

  return asArray(parsed.multistatus?.response);

}


async function discoverPrincipalUrl(email, appPassword) {

  const body = `<?xml version="1.0" encoding="utf-8" ?>
<propfind xmlns="DAV:">
  <prop><current-user-principal/></prop>
</propfind>`;

  const responses = await propfind(`${CALDAV_BASE}/`, email, appPassword, body, "0");
  const href = findProp(responses, "current-user-principal")?.href;

  if (!href) {
    throw new Error("Couldn't find your Apple Calendar account - double check the Apple ID email.");
  }

  return href;

}


async function discoverCalendarHomeUrl(principalHref, email, appPassword) {

  const body = `<?xml version="1.0" encoding="utf-8" ?>
<propfind xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <prop><C:calendar-home-set/></prop>
</propfind>`;

  const responses = await propfind(`${CALDAV_BASE}${principalHref}`, email, appPassword, body, "0");
  const href = findProp(responses, "calendar-home-set")?.href;

  if (!href) {
    throw new Error("Couldn't find your iCloud calendars - double check your Apple ID email and app-specific password.");
  }

  return href;

}


// Walks the calendar-home collection (Depth 1) and picks the first
// writable calendar that actually supports events - iCloud accounts also
// expose task lists, the home collection itself, and internal
// scheduling inbox/outbox collections under the same home, none of which
// are what "sync my appointments" should mean.
async function discoverTargetCalendarUrl(homeHref, email, appPassword) {

  const body = `<?xml version="1.0" encoding="utf-8" ?>
<propfind xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <prop>
    <resourcetype/>
    <displayname/>
    <C:supported-calendar-component-set/>
  </prop>
</propfind>`;

  const responses = await propfind(`${CALDAV_BASE}${homeHref}`, email, appPassword, body, "1");

  for (const response of responses) {

    const href = response.href;

    if (!href || href === homeHref || /inbox|outbox|notification/i.test(href)) {
      continue;
    }

    for (const propstat of asArray(response.propstat)) {

      if (!String(propstat.status || "").includes("200")) {
        continue;
      }

      const prop = propstat.prop || {};
      const resourcetype = prop.resourcetype;
      const isCalendar = resourcetype && Object.prototype.hasOwnProperty.call(resourcetype, "calendar");

      if (!isCalendar) {
        continue;
      }

      const comps = asArray(prop["supported-calendar-component-set"]?.comp);
      const supportsEvents = comps.some((comp) => (comp["@_name"] || "").toUpperCase() === "VEVENT");

      if (!supportsEvents) {
        continue;
      }

      return `${CALDAV_BASE}${href}`;

    }

  }

  throw new Error("Connected to Apple, but couldn't find a calendar to sync appointments to.");

}


// Runs the full discovery walk (principal -> calendar home -> target
// calendar) and returns the calendar's CalDAV URL. Doubles as the
// connection test: any wrong credential fails here with isAuthError set,
// before anything is ever stored - mirrors exchangeCodeForTokens
// validating a Google connection before setGoogleCalendarConnection
// persists it.
const discoverCalendarUrl = async (email, appPassword) => {

  const principalHref = await discoverPrincipalUrl(email, appPassword);
  const homeHref = await discoverCalendarHomeUrl(principalHref, email, appPassword);

  return discoverTargetCalendarUrl(homeHref, email, appPassword);

};


function icsEscape(text) {

  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");

}


function toICalDate(date) {

  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

}


// Deterministic from the appointment's own id, so create/update both
// just PUT to this same URL (CalDAV overwrites in place) and delete
// needs no separately-stored event id the way Google's does.
function eventUrl(calendarUrl, appointmentId) {

  const base = calendarUrl.endsWith("/") ? calendarUrl : `${calendarUrl}/`;

  return `${base}${appointmentId}.ics`;

}


function buildEventIcs(uid, appointment) {

  const start = new Date(appointment.start_time);

  const end = appointment.end_time
    ? new Date(appointment.end_time)
    : new Date(start.getTime() + DEFAULT_DURATION_MS);

  const lines = [

    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Atlas//Calendar Sync//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toICalDate(new Date())}`,
    `DTSTART:${toICalDate(start)}`,
    `DTEND:${toICalDate(end)}`,
    `SUMMARY:${icsEscape(appointment.title)}`

  ];

  if (appointment.notes) {
    lines.push(`DESCRIPTION:${icsEscape(appointment.notes)}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.join("\r\n");

}


// Creates or updates (CalDAV PUT is idempotent by URL) the event for an
// appointment. Returns the event's CalDAV URL, mirroring
// googleCalendarService.createCalendarEvent returning an id - callers
// don't currently need to persist it (see eventUrl above), but keeping
// the return value makes this consistent with its Google counterpart.
const upsertCalendarEvent = async (email, appPassword, calendarUrl, appointment) => {

  const uid = `${appointment.id}@atlas.app`;
  const ics = buildEventIcs(uid, appointment);
  const url = eventUrl(calendarUrl, appointment.id);

  const res = await davRequest(url, {

    method: "PUT",
    email,
    appPassword,
    headers: { "Content-Type": "text/calendar; charset=utf-8" },
    body: ics

  });

  if (res.status >= 300) {

    throw new Error(`Couldn't sync the Apple Calendar event (status ${res.status}).`);

  }

  return url;

};


const deleteCalendarEvent = async (email, appPassword, calendarUrl, appointmentId) => {

  const url = eventUrl(calendarUrl, appointmentId);

  const res = await davRequest(url, {

    method: "DELETE",
    email,
    appPassword

  });

  // A 404 just means there was nothing to delete (e.g. the appointment
  // was created before Apple Calendar was connected, so it was never
  // pushed in the first place) - not a real failure.
  if (res.status >= 300 && res.status !== 404) {

    throw new Error(`Couldn't remove the Apple Calendar event (status ${res.status}).`);

  }

};



module.exports = {

  discoverCalendarUrl,

  upsertCalendarEvent,

  deleteCalendarEvent

};
