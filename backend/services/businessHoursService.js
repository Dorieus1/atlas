// Structured weekly business hours: shape validation (used when a business
// saves its settings) and enforcement (used when a customer requests an
// appointment through the portal). Internal staff-facing appointment
// creation deliberately never calls the enforcement half of this file -
// staff can always schedule outside normal hours for exceptions.

// Indexed to match JS Date#getUTCDay()/getDay() (0 = Sunday ... 6 = Saturday),
// and also to Intl.DateTimeFormat's "weekday: long" output below once
// lowercased and truncated to 3 chars.
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const DAY_LABELS = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday"
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;


// Validates the shape a business owner submits from Settings. Returns
// { valid: true, normalized } where normalized is either null (hours not
// configured - enforcement stays off) or a plain object with exactly the
// seven day keys, each either null (closed) or { open, close } in HH:MM.
// Returns { valid: false, error } with a message safe to show directly.
function validateBusinessHours(value) {

  if (value === null || value === undefined) {
    return { valid: true, normalized: null };
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return {
      valid: false,
      error: "business_hours must be an object keyed by day (mon..sun), or null"
    };
  }

  const unknownKeys = Object.keys(value).filter((key) => !DAY_KEYS.includes(key));

  if (unknownKeys.length > 0) {
    return {
      valid: false,
      error: `business_hours has unrecognized day key(s): ${unknownKeys.join(", ")}. Use: ${DAY_KEYS.join(", ")}`
    };
  }

  const normalized = {};

  for (const day of DAY_KEYS) {

    const entry = value[day];

    if (entry === undefined || entry === null) {
      normalized[day] = null;
      continue;
    }

    if (typeof entry !== "object" || Array.isArray(entry)) {
      return {
        valid: false,
        error: `${DAY_LABELS[day]}'s hours must be an object with open/close, or null for closed`
      };
    }

    const { open, close } = entry;

    if (!TIME_RE.test(open) || !TIME_RE.test(close)) {
      return {
        valid: false,
        error: `${DAY_LABELS[day]}'s open/close times must be in 24-hour HH:MM format (e.g. "09:00")`
      };
    }

    if (open >= close) {
      return {
        valid: false,
        error: `${DAY_LABELS[day]}'s open time must be earlier than its close time`
      };
    }

    normalized[day] = { open, close };

  }

  return { valid: true, normalized };

}


// Maps Intl's "weekday: long" English output to our DAY_KEYS.
const WEEKDAY_TO_KEY = {
  Sunday: "sun",
  Monday: "mon",
  Tuesday: "tue",
  Wednesday: "wed",
  Thursday: "thu",
  Friday: "fri",
  Saturday: "sat"
};

// Validates an IANA timezone name the way Node itself validates one: by
// asking Intl to build a formatter for it and catching the RangeError it
// throws for anything it doesn't recognize. Empty/null/undefined are
// treated as valid on purpose - they mean "not set" (defaults to UTC).
function isValidTimezone(timezone) {

  if (timezone === null || timezone === undefined || timezone === "") {
    return true;
  }

  if (typeof timezone !== "string") {
    return false;
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch (error) {
    return false;
  }

}

// Converts a UTC instant into the given IANA timezone's local day-of-week
// key and HH:MM. Falls back to UTC when timezone is null/undefined, which
// preserves the exact pre-timezone behavior for businesses that haven't
// set one yet.
function getLocalDayAndTime(date, timezone) {

  const zone = timezone || "UTC";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const lookup = {};

  for (const part of parts) {
    lookup[part.type] = part.value;
  }

  const dayKey = WEEKDAY_TO_KEY[lookup.weekday];

  // Some ICU builds format local midnight as hour "24" instead of "00"
  // when hour12 is false. Normalize that here so time comparisons below
  // (which expect 00:00-23:59) never see an out-of-range hour.
  const hh = lookup.hour === "24" ? "00" : lookup.hour;
  const mm = lookup.minute;

  return {
    dayKey,
    time: `${hh}:${mm}`
  };

}

// Checks a proposed appointment start_time against a business's stored
// business_hours (the raw TEXT column value - a JSON string or null) and
// timezone (an IANA name, or null/undefined meaning UTC). Returns
// { allowed: true } when the request should proceed, which includes both
// "inside configured hours" and "no hours configured at all" (NULL must
// never turn into "reject everything"). Malformed stored JSON also fails
// open rather than blocking every customer over bad data.
function checkWithinBusinessHours(businessHoursRaw, startTimeIso, timezone) {

  if (!businessHoursRaw) {
    return { allowed: true };
  }

  let hours;

  try {
    hours = JSON.parse(businessHoursRaw);
  } catch (parseError) {
    return { allowed: true };
  }

  if (!hours || typeof hours !== "object") {
    return { allowed: true };
  }

  const date = new Date(startTimeIso);
  const { dayKey, time } = getLocalDayAndTime(date, timezone);
  const dayHours = hours[dayKey];

  if (!dayHours || !dayHours.open || !dayHours.close) {

    return {
      allowed: false,
      error: `We're closed on ${DAY_LABELS[dayKey]}s. Please choose a different day.`
    };

  }

  if (time < dayHours.open || time >= dayHours.close) {

    return {
      allowed: false,
      error: `We're open ${DAY_LABELS[dayKey]}s from ${dayHours.open} to ${dayHours.close}. Please choose a time in that range.`
    };

  }

  return { allowed: true };

}


// Full local-calendar breakdown (not just day-of-week/time like
// getLocalDayAndTime above) - the availability engine needs the local
// YEAR/MONTH/DAY too, to run the "guess and correct" UTC conversion
// below.
function getZonedParts(date, timezone) {

  const zone = timezone || "UTC";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);

  const lookup = {};

  for (const part of parts) {
    lookup[part.type] = part.value;
  }

  // Same ICU "24" quirk as getLocalDayAndTime above.
  const hour = lookup.hour === "24" ? 0 : Number(lookup.hour);

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour,
    minute: Number(lookup.minute),
    second: Number(lookup.second)
  };

}


// Converts a LOCAL wall-clock time (a calendar date + HH:MM, in the given
// IANA timezone) to the UTC instant it represents - the direction none of
// this file needed before now, since checkWithinBusinessHours above only
// ever goes UTC-instant -> local wall-clock, not the reverse. Needed by
// availabilityService.js to turn "9:00 AM Tuesday, business's own
// timezone" into a real, storable start_time.
//
// Standard "guess and correct" technique for this without a date library:
// there's no direct JS API for local-time -> UTC in an arbitrary IANA
// zone (only the reverse, via Intl), so first assume the wall-clock
// numbers ARE UTC (a guess), then ask Intl what wall-clock time that
// guess actually renders as in the target zone. The gap between "what we
// wanted" and "what the guess produced" is exactly that zone's UTC
// offset at that instant, which corrects the guess into the right
// answer. One correction pass is standard practice and sufficiently
// accurate outside the rare instant of a DST transition itself - the
// same class of edge case already accepted elsewhere in this codebase's
// recurrence-date math, not something new introduced here.
function zonedTimeToUtc(year, month, day, hour, minute, timezone) {

  const zone = timezone || "UTC";

  const guessMs = Date.UTC(year, month - 1, day, hour, minute, 0);

  const rendered = getZonedParts(new Date(guessMs), zone);

  const renderedMs = Date.UTC(rendered.year, rendered.month - 1, rendered.day, rendered.hour, rendered.minute, rendered.second);

  const offsetMs = renderedMs - guessMs;

  return new Date(guessMs - offsetMs);

}


module.exports = {

  DAY_KEYS,

  DAY_LABELS,

  validateBusinessHours,

  checkWithinBusinessHours,

  isValidTimezone,

  getLocalDayAndTime,

  getZonedParts,

  zonedTimeToUtc

};
