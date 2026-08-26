// Apple Calendar sync talks to iCloud's CalDAV endpoint over plain
// fetch (there's no separate SDK the way googleapis is for Google), and
// fetch is already mocked globally for Resend email sends (see
// mockEmail.js, loaded before this file in jest.config.js). This wraps
// that existing fetch mock: any request to caldav.icloud.com is handled
// here with canned iCloud-shaped responses, everything else falls
// through to the original (email) mock untouched.
const CALDAV_BASE = "https://caldav.icloud.com";

const PRINCIPAL_HREF = "/12345678/principal/";
const HOME_HREF = "/12345678/calendars/";
const CALENDAR_HREF = "/12345678/calendars/home/";

const principalXml = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:">
  <response>
    <href>/</href>
    <propstat>
      <prop><current-user-principal><href>${PRINCIPAL_HREF}</href></current-user-principal></prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`;

const homeSetXml = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <response>
    <href>${PRINCIPAL_HREF}</href>
    <propstat>
      <prop><C:calendar-home-set><href>${HOME_HREF}</href></C:calendar-home-set></prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`;

const calendarListXml = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <response>
    <href>${HOME_HREF}</href>
    <propstat>
      <prop><resourcetype><collection/></resourcetype></prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
  <response>
    <href>${HOME_HREF}inbox/</href>
    <propstat>
      <prop><resourcetype><collection/></resourcetype></prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
  <response>
    <href>${CALENDAR_HREF}</href>
    <propstat>
      <prop>
        <resourcetype><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype>
        <displayname>Home</displayname>
        <C:supported-calendar-component-set>
          <C:comp name="VEVENT"/>
          <C:comp name="VTODO"/>
        </C:supported-calendar-component-set>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`;

let forceAuthFailure = false;

const putCalls = [];
const deleteCalls = [];

const originalFetch = global.fetch;

global.fetch = jest.fn(async (url, init = {}) => {

  const href = String(url);

  if (!href.startsWith(CALDAV_BASE)) {
    return originalFetch(url, init);
  }

  if (forceAuthFailure) {
    return { status: 401, text: async () => "" };
  }

  const method = init.method || "GET";

  if (method === "PROPFIND") {

    if (href === `${CALDAV_BASE}/`) {
      return { status: 207, text: async () => principalXml };
    }

    if (href === `${CALDAV_BASE}${PRINCIPAL_HREF}`) {
      return { status: 207, text: async () => homeSetXml };
    }

    if (href === `${CALDAV_BASE}${HOME_HREF}`) {
      return { status: 207, text: async () => calendarListXml };
    }

    return { status: 404, text: async () => "" };

  }

  if (method === "PUT") {
    putCalls.push({ url: href, body: init.body });
    return { status: 201, text: async () => "" };
  }

  if (method === "DELETE") {
    deleteCalls.push({ url: href });
    return { status: 204, text: async () => "" };
  }

  return { status: 404, text: async () => "" };

});

global.__mockAppleCalendar = {

  setAuthFailure: (value) => { forceAuthFailure = value; },

  reset: () => {
    forceAuthFailure = false;
    putCalls.length = 0;
    deleteCalls.length = 0;
  },

  putCalls,

  deleteCalls,

  targetCalendarUrl: `${CALDAV_BASE}${CALENDAR_HREF}`

};
