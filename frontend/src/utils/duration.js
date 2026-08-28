// A plain "2h 15m" readout for a completed clock-in/out session - minutes
// only (no seconds), since a job's actual labor cost is billed/estimated
// in fractions of an hour, not down to the second. Shared between
// Schedule.jsx and Today.jsx (the field view) - both show the same
// "Logged Xh Ym" line for a clocked appointment, and there's no reason
// for those two readouts to ever drift apart.
export function formatDuration(startIso, endIso) {

  const minutes = Math.max(0, Math.round((new Date(endIso) - new Date(startIso)) / 60000));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${remainingMinutes}m`;
  }

  return `${hours}h ${remainingMinutes}m`;

}
