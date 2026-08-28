const db = require("../../database/db");
const { withTransaction } = require("../../database/transactionQueue");
const { getLocalDayAndTime, getZonedParts, zonedTimeToUtc } = require("./businessHoursService");
const { getAppointments, createAppointment } = require("./appointmentService");


const runAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });
  });

};


// Same fallback duration every other unscheduled-duration appointment in
// this codebase uses (appointmentService.js's DEFAULT_DURATION_MS).
const DEFAULT_DURATION_MINUTES = 60;

// Candidate start times are generated on a fixed grid rather than "every
// minute" - 30 minutes is a reasonable granularity for a service visit
// and keeps the response size sane. Not currently configurable per
// business; a fine v2 knob, not needed for v1.
const SLOT_INTERVAL_MINUTES = 30;

// A customer booking themselves in shouldn't be able to grab a slot
// starting in the next few minutes, or even in "the past today" once
// business hours open earlier than the actual current time - the
// business needs at least a little real notice to prepare. Also
// protects against an off-by-a-few-seconds race between the browser
// showing a slot and the booking request landing.
const MIN_NOTICE_MINUTES = 60;

// How far into the future the self-service booking page will ever offer
// a slot - matches the same order of magnitude as
// MAX_RECURRING_OCCURRENCES elsewhere in this codebase: generous for
// real use, bounded so a bad/huge `days` query param can't make this
// endpoint do unbounded work.
const MAX_DAYS_AHEAD = 60;


function toDateKey(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}


// Every scheduled/requested appointment for the business, reduced to
// just the [start, end) window each one occupies - the same "active
// statuses occupy a slot" rule appointmentService.js's attachConflicts
// already established, reused here rather than re-invented. Unassigned
// appointments (the default, and the only kind a public booking can
// ever create) conflict with EVERYTHING, matching attachConflicts' own
// "unassigned stands in for the whole business" rule - a public visitor
// booking themselves in has no way to pick a specific technician, so
// treating every existing booking as blocking is the conservative,
// correct default for this endpoint regardless of whether the business
// actually uses per-technician assignment.
async function getBusyRanges(business_id) {

  const appointments = await getAppointments(business_id);

  const ACTIVE_STATUSES = new Set(["scheduled", "requested"]);

  return appointments
    .filter((appt) => ACTIVE_STATUSES.has(appt.status))
    .map((appt) => {

      const start = new Date(appt.start_time).getTime();
      const end = appt.end_time
        ? new Date(appt.end_time).getTime()
        : start + DEFAULT_DURATION_MINUTES * 60 * 1000;

      return { start, end };

    });

}


function overlapsAny(candidateStart, candidateEnd, busyRanges) {

  return busyRanges.some((range) => candidateStart < range.end && range.start < candidateEnd);

}


// One calendar day's open slots, in the business's own local timezone -
// a day with no hours configured for that weekday (closed, or hours
// never set up at all) simply returns no slots, rather than guessing.
function getSlotsForDay(business, year, month, day, durationMinutes, busyRanges, now) {

  if (!business.business_hours) {
    return [];
  }

  let hours;

  try {
    hours = JSON.parse(business.business_hours);
  } catch (parseError) {
    return [];
  }

  if (!hours || typeof hours !== "object") {
    return [];
  }

  // Which weekday key this calendar date falls on, IN THE BUSINESS'S OWN
  // TIMEZONE - a date can be a different day-of-week in UTC than it is
  // locally, and business_hours is defined in local terms. Anchored to
  // local noon (not midnight) specifically so this stays correct even
  // for the most extreme real IANA offsets (up to UTC+14) - local noon
  // converted to UTC can still land near a UTC calendar-day boundary at
  // those extremes, so the day-of-week is read back out via
  // getLocalDayAndTime's own Intl-based conversion (the same one
  // checkWithinBusinessHours already relies on) rather than inferred
  // from the UTC instant's own date, which would be wrong exactly at
  // those extremes.
  const noonLocalGuess = zonedTimeToUtc(year, month, day, 12, 0, business.timezone);
  const { dayKey } = getLocalDayAndTime(noonLocalGuess, business.timezone);
  const dayHours = hours[dayKey];

  if (!dayHours || !dayHours.open || !dayHours.close) {
    return [];
  }

  const [openHour, openMinute] = dayHours.open.split(":").map(Number);
  const [closeHour, closeMinute] = dayHours.close.split(":").map(Number);

  const dayOpenUtc = zonedTimeToUtc(year, month, day, openHour, openMinute, business.timezone);
  const dayCloseUtc = zonedTimeToUtc(year, month, day, closeHour, closeMinute, business.timezone);

  const durationMs = durationMinutes * 60 * 1000;
  const intervalMs = SLOT_INTERVAL_MINUTES * 60 * 1000;
  const minNoticeMs = MIN_NOTICE_MINUTES * 60 * 1000;
  const earliestAllowed = now.getTime() + minNoticeMs;

  const slots = [];

  for (let start = dayOpenUtc.getTime(); start + durationMs <= dayCloseUtc.getTime(); start += intervalMs) {

    if (start < earliestAllowed) {
      continue;
    }

    if (overlapsAny(start, start + durationMs, busyRanges)) {
      continue;
    }

    slots.push(new Date(start).toISOString());

  }

  return slots;

}


// The full multi-day availability response the public booking page
// renders - one entry per calendar day (business's own local calendar,
// not UTC), each with whatever open, unbooked slots that day has left
// (an empty array for a closed day or a fully-booked one - the frontend
// treats both the same way, "nothing to pick here").
async function getAvailability(business, startDateKey, days, durationMinutes) {

  const numDays = Math.min(Math.max(Number(days) || 7, 1), MAX_DAYS_AHEAD);
  const duration = Number(durationMinutes) || DEFAULT_DURATION_MINUTES;

  const now = new Date();

  const [startYear, startMonth, startDay] = (startDateKey || toDateKey(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()))
    .split("-")
    .map(Number);

  const busyRanges = await getBusyRanges(business.id);

  const results = [];

  for (let i = 0; i < numDays; i++) {

    // Walking calendar days via a plain UTC Date's own date arithmetic
    // (not local-timezone arithmetic) - this is just a counter for "N
    // days after the start date," not itself a real instant, so there's
    // no timezone to get wrong here.
    const cursor = new Date(Date.UTC(startYear, startMonth - 1, startDay + i));

    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const day = cursor.getUTCDate();

    const slots = getSlotsForDay(business, year, month, day, duration, busyRanges, now);

    results.push({
      date: toDateKey(year, month, day),
      slots
    });

  }

  return results;

}


// Re-validates one specific candidate slot at the moment of booking -
// never trust that a slot a client fetched moments (or minutes) ago is
// still actually open. Returns true only if that exact start_time still
// falls within a real open window and doesn't overlap anything that's
// been booked since.
async function isSlotStillAvailable(business, startTimeIso, durationMinutes) {

  const start = new Date(startTimeIso);

  if (Number.isNaN(start.getTime())) {
    return false;
  }

  const duration = Number(durationMinutes) || DEFAULT_DURATION_MINUTES;

  const parts = getZonedParts(start, business.timezone);

  const dayOfferings = await getAvailability(
    business,
    toDateKey(parts.year, parts.month, parts.day),
    1,
    duration
  );

  const daySlots = dayOfferings[0] ? dayOfferings[0].slots : [];

  return daySlots.includes(start.toISOString());

}



// A peer review caught a real race here: isSlotStillAvailable above is a
// pure read with no lock, and createAppointment (appointmentService.js)
// is an unconditional INSERT with no conflict checking of its own - the
// controller calling "check, then insert" as two separate steps left a
// real window for two visitors clicking "Book" on the same popular slot
// within the same second to both pass the check before either write
// landed, producing a genuine double-booking with no error to either
// side. This is the same bug SHAPE this codebase already fixed three
// other times the same day (an atomic compare-and-swap UPDATE for the
// Stripe webhook and quote-signing races, a DB-level unique index for
// the appointment-completion duplicate-invoice race) - but neither of
// those shapes fits here: the thing being raced isn't a single column's
// value, it's a computed time-RANGE overlap (two different start times
// on a 30-minute grid can still overlap if the duration spans more than
// one grid step), which a plain unique index can't express. A real
// BEGIN/COMMIT transaction, routed through the app's shared
// withTransaction mutex (database/transactionQueue.js) the same way
// quoteService.js already does for its own multi-statement writes, is
// what actually closes this: the mutex guarantees no second call's
// check-then-insert can even START until the first one has fully
// committed or rolled back, so the read and the write behave as one
// atomic unit against any other concurrent booking attempt.
async function createAppointmentIfSlotAvailable(business, start_time, durationMinutes, appointmentArgs) {

  return withTransaction(async () => {

    await runAsync("BEGIN TRANSACTION");

    try {

      const stillAvailable = await isSlotStillAvailable(business, start_time, durationMinutes);

      if (!stillAvailable) {

        await runAsync("ROLLBACK");

        return { error: "slot_taken" };

      }

      const appointmentId = await createAppointment(...appointmentArgs);

      await runAsync("COMMIT");

      return { appointmentId };

    } catch (err) {

      await runAsync("ROLLBACK").catch(() => {});

      throw err;

    }

  });

}


module.exports = {

  getAvailability,

  isSlotStillAvailable,

  createAppointmentIfSlotAvailable,

  DEFAULT_DURATION_MINUTES,

  MIN_NOTICE_MINUTES,

  MAX_DAYS_AHEAD

};
