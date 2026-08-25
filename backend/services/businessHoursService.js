// Structured weekly business hours: shape validation (used when a business
// saves its settings) and enforcement (used when a customer requests an
// appointment through the portal). Internal staff-facing appointment
// creation deliberately never calls the enforcement half of this file -
// staff can always schedule outside normal hours for exceptions.

// Indexed to match JS Date#getUTCDay()/getDay() (0 = Sunday ... 6 = Saturday).
// Times are compared in UTC, same as every other date already flowing
// through this app as an ISO string - there's no per-business timezone
// setting yet, so "9am" here means 9am UTC.
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


// Checks a proposed appointment start_time against a business's stored
// business_hours (the raw TEXT column value - a JSON string or null).
// Returns { allowed: true } when the request should proceed, which
// includes both "inside configured hours" and "no hours configured at
// all" (NULL must never turn into "reject everything"). Malformed stored
// JSON also fails open rather than blocking every customer over bad data.
function checkWithinBusinessHours(businessHoursRaw, startTimeIso) {

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
  const dayKey = DAY_KEYS[date.getUTCDay()];
  const dayHours = hours[dayKey];

  if (!dayHours || !dayHours.open || !dayHours.close) {

    return {
      allowed: false,
      error: `We're closed on ${DAY_LABELS[dayKey]}s. Please choose a different day.`
    };

  }

  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const time = `${hh}:${mm}`;

  if (time < dayHours.open || time >= dayHours.close) {

    return {
      allowed: false,
      error: `We're open ${DAY_LABELS[dayKey]}s from ${dayHours.open} to ${dayHours.close}. Please choose a time in that range.`
    };

  }

  return { allowed: true };

}


module.exports = {

  DAY_KEYS,

  DAY_LABELS,

  validateBusinessHours,

  checkWithinBusinessHours

};
