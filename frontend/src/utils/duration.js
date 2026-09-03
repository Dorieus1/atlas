// A plain "2h 15m" readout for a duration in minutes - minutes only (no
// seconds), since a job's actual labor cost is billed/estimated in
// fractions of an hour, not down to the second.
export function formatMinutes(minutes) {

  const wholeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(wholeMinutes / 60);
  const remainingMinutes = wholeMinutes % 60;

  if (hours === 0) {
    return `${remainingMinutes}m`;
  }

  return `${hours}h ${remainingMinutes}m`;

}


// Same readout as above, but computed from a single start/end ISO pair.
export function formatDuration(startIso, endIso) {

  return formatMinutes((new Date(endIso) - new Date(startIso)) / 60000);

}


// Collapses an appointment's `time_entries` array (one row per clock
// session - see migration 059 and timeEntryService.js) into one summary
// per person who has ever clocked into this job: their total logged
// minutes across every closed session, plus whether they currently have
// an open one. A solo job still comes back as an array of length 1 -
// callers don't need a separate "single person" code path, they can
// always just map over this.
export function summarizeTimeEntries(timeEntries = []) {

  const byUser = new Map();

  for (const entry of timeEntries) {

    const key = entry.user_id || "unknown";

    if (!byUser.has(key)) {

      byUser.set(key, {
        user_id: entry.user_id,
        user_name: entry.user_name,
        totalMinutes: 0,
        isOpen: false
      });

    }

    const bucket = byUser.get(key);

    if (entry.clock_out_at) {
      bucket.totalMinutes += Math.max(0, (new Date(entry.clock_out_at) - new Date(entry.clock_in_at)) / 60000);
    } else {
      bucket.isOpen = true;
    }

  }

  return [...byUser.values()];

}
