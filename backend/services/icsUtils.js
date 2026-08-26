// Shared by appleCalendarService.js (one event per CalDAV PUT) and
// calendarFeedService.js (many events in one subscribable feed) - the
// per-field escaping and date formatting rules are identical in both;
// only how many VEVENT blocks get wrapped in a VCALENDAR differs.

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


module.exports = {
  icsEscape,
  toICalDate
};
