const { getAvailability, createAppointmentIfSlotAvailable, DEFAULT_DURATION_MINUTES } = require("./availabilityService");
const { createNotification } = require("./notificationService");


// How many days ahead the AI is shown when it asks "what's open" - kept
// small on purpose. A customer asking about scheduling almost always
// means "soon," and every extra day is more tokens spent on a tool
// result the model will mostly ignore. A customer who explicitly wants
// something further out can still ask "what about the week of the 20th"
// and check_availability's own start_date argument handles that.
const DEFAULT_LOOKAHEAD_DAYS = 5;

// Slots per day handed to the model - a fully open 9-5 day on a 30-minute
// grid is already 15+ slots; capping keeps the tool result (and the
// model's own summary of it back to the customer) short and readable
// rather than a wall of timestamps nobody's going to read one by one.
const MAX_SLOTS_PER_DAY_FOR_MODEL = 8;

const MAX_TITLE_LENGTH = 200;
const MAX_NOTES_LENGTH = 2000;


const TOOL_DEFINITIONS = [

  {
    type: "function",
    name: "check_availability",
    strict: false,
    description: "Look up this business's REAL open appointment slots, starting from a given date (or today if not given). Always call this before telling a customer what times are available - never guess, estimate, or invent a time on your own. Each returned slot includes an exact start_time; use that exact value, unchanged, if you go on to call book_appointment.",
    parameters: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "The first date to check, as YYYY-MM-DD. Omit to start from today."
        }
      },
      required: [],
      additionalProperties: false
    }
  },

  {
    type: "function",
    name: "book_appointment",
    strict: false,
    description: "Book a real appointment for this customer at an exact start_time previously returned by check_availability. Only call this once the customer has clearly agreed to one specific time from a real check_availability result - never call it with a time you haven't just confirmed is actually open, and never call it based on a guess about what 'Tuesday' or 'morning' means without having checked first.",
    parameters: {
      type: "object",
      properties: {
        start_time: {
          type: "string",
          description: "The exact start_time string of the chosen slot, copied exactly as returned by check_availability - do not reformat or recompute it."
        },
        title: {
          type: "string",
          description: "A short description of what the appointment is for, based on what the customer said (e.g. 'Leaky kitchen faucet'). Omit for a generic title."
        }
      },
      required: ["start_time"],
      additionalProperties: false
    }
  }

];


function formatDayLabel(dateKey, timezone) {

  const [year, month, day] = dateKey.split("-").map(Number);

  // Noon UTC, not midnight - avoids the date rolling back a day when
  // formatted in a timezone west of UTC, purely a display-label concern
  // here (the real slot times below carry their own correct instants).
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12));

  return noonUtc.toLocaleDateString("en-US", {
    timeZone: timezone || "UTC",
    weekday: "long",
    month: "long",
    day: "numeric"
  });

}


function formatSlotLabel(iso, timezone) {

  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: timezone || "UTC",
    hour: "numeric",
    minute: "2-digit"
  });

}


// Condenses getAvailability's raw output into the shape handed to the
// model - day labels and slot times spelled out in the BUSINESS's own
// timezone (this is the business's own AI speaking on its behalf, not a
// visitor's browser rendering a page), so what it says out loud already
// matches what the business itself means by "9am."
function formatAvailabilityForModel(days, timezone) {

  return days.map((day) => {

    const label = formatDayLabel(day.date, timezone);

    if (day.slots.length === 0) {

      return { date: day.date, label, status: "closed_or_fully_booked", slots: [] };

    }

    const shown = day.slots.slice(0, MAX_SLOTS_PER_DAY_FOR_MODEL);

    return {

      date: day.date,
      label,
      status: "open",
      slots: shown.map((iso) => ({ start_time: iso, time_label: formatSlotLabel(iso, timezone) })),
      more_available: day.slots.length > shown.length

    };

  });

}


// Tool schemas + their real execution, bundled together since they're
// tightly coupled (the execution closures need business/customer from
// the already-authenticated/resolved conversation context - the model
// itself never supplies or sees a business_id/customer_id, exactly like
// it never sees one for anything else in this chat pipeline).
//
// Deliberately returns no tools at all when the business hasn't
// configured real hours - there's nothing for check_availability to
// honestly report in that case (see availabilityService.getAvailability's
// own "no hours configured" handling), so rather than exposing a tool
// that always comes back empty, the model just relies on its plain-text
// instructions to say scheduling isn't self-service yet.
// `preview` is true for the internal, authenticated "test what Atlas
// would say" box in the CRM (ChatWindow.jsx / chatController.chatResponse)
// - never for a real customer, on the public widget or in their portal.
// check_availability is still allowed there (it's read-only, and being
// able to test "does Atlas know our hours" is the actual point of a
// preview), but book_appointment is refused rather than executed - a
// business owner poking at "what would Atlas say if someone asked to
// book Tuesday" must never actually consume a real slot or create a
// real appointment on their own calendar just from testing a reply.
function buildChatTools(business, customer, { preview = false } = {}) {

  if (!business?.business_hours) {

    return { definitions: [], execute: null };

  }

  return {

    definitions: TOOL_DEFINITIONS,

    async execute(name, args) {

      if (name === "check_availability") {

        const days = await getAvailability(business, args?.start_date, DEFAULT_LOOKAHEAD_DAYS, DEFAULT_DURATION_MINUTES);

        return { days: formatAvailabilityForModel(days, business.timezone) };

      }

      if (name === "book_appointment" && preview) {

        return { success: false, error: "This is a preview - booking isn't performed here. Try it from the customer's own real chat." };

      }

      if (name === "book_appointment") {

        const start_time = args?.start_time;

        if (!start_time || Number.isNaN(new Date(start_time).getTime())) {

          return { success: false, error: "start_time must be a valid time from check_availability" };

        }

        const title = args?.title && String(args.title).trim()
          ? String(args.title).trim().slice(0, MAX_TITLE_LENGTH)
          : "Appointment request";

        const notes = args?.notes ? String(args.notes).trim().slice(0, MAX_NOTES_LENGTH) : null;

        const result = await createAppointmentIfSlotAvailable(

          business,
          start_time,
          DEFAULT_DURATION_MINUTES,
          [business.id, customer.id, title, notes, start_time, null, "requested"]

        );

        if (result.error === "slot_taken") {

          return { success: false, error: "That time is no longer available - call check_availability again for current options." };

        }

        // Best-effort, same reasoning as every other chat-pipeline side
        // effect in chatService.js - the booking itself already
        // succeeded above, so a notification hiccup must never make
        // that look like it failed.
        try {

          await createNotification(

            business.id,

            "appointment_requested",

            `🤖 ${customer.name || "A customer"} booked an appointment via chat`,

            title,

            "/schedule"

          );

        } catch (notificationError) {

          console.error("AI CHAT BOOKING NOTIFICATION FAILED:", notificationError);

        }

        return { success: true, appointment_id: result.appointmentId, start_time };

      }

      return { error: `Unknown tool: ${name}` };

    }

  };

}


module.exports = { buildChatTools };
