import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

import { getAppointments } from "../../api/atlasApi";
import { formatMinutes } from "../../utils/duration";
import EmptyState from "../EmptyState";
import Skeleton from "../Skeleton";


// Matches NotificationBell's own polling cadence - frequent enough that
// someone clocking in shows up here within half a minute, without
// hammering the appointments endpoint.
const POLL_INTERVAL_MS = 30000;


// Real per-technician time tracking (migration 059) means "who's
// actually working right now" is a genuine live question an owner in
// the office can ask - not just "what's on the schedule today," which
// Today.jsx already answers, but "is anyone actually out on a job at
// this exact moment." Pulls from the same GET /api/appointments every
// other schedule view already uses (each appointment now carries its
// own time_entries array) rather than a new endpoint, and flattens
// every appointment's open sessions into one flat, business-wide list.
//
// Not owner-gated, unlike Timesheets - this is presence, not pay. Any
// team member seeing "Sam is on the Johnson job right now" is the same
// kind of information Schedule.jsx's "Everyone" view already shares
// with the whole team.
function ClockedInPanel() {

  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {

    try {

      const appointments = await getAppointments();

      const openEntries = appointments
        .flatMap((appt) =>
          (appt.time_entries || [])
            .filter((entry) => !entry.clock_out_at)
            .map((entry) => ({
              ...entry,
              appointment_title: appt.title,
              customer_name: appt.customer_name
            }))
        )
        .sort((a, b) => new Date(a.clock_in_at) - new Date(b.clock_in_at));

      setEntries(openEntries);
      setError("");

    } catch (err) {

      console.error("CLOCKED IN PANEL ERROR:", err);
      setError("Couldn't load who's clocked in. Please refresh to try again.");

    } finally {

      setLoading(false);

    }

  };

  useEffect(() => {

    load();

    const interval = setInterval(load, POLL_INTERVAL_MS);

    return () => clearInterval(interval);

  }, []);


  return (

    <div className="h-full rounded-2xl border border-border bg-surface/60 p-6">

      <h2 className="mb-6 flex items-center gap-2 text-2xl font-bold">
        <Clock size={24} />
        On The Clock
      </h2>

      {error && (
        <p className="mb-4 text-danger">
          {error}
        </p>
      )}

      {loading ? (

        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>

      ) : entries.length === 0 ? (

        <EmptyState
          icon={Clock}
          title="No one's clocked in right now"
          description="When a team member clocks into a job, they'll show up here."
        />

      ) : (

        <div className="flex flex-col gap-3">

          {entries.map((entry) => (

            <div
              key={entry.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-surface-muted p-4"
            >

              <div className="min-w-0">

                <p className="truncate font-semibold">
                  {entry.user_name || "A teammate"}
                </p>

                <p className="truncate text-sm text-fg-faint">
                  {entry.appointment_title}
                  {entry.customer_name ? ` · ${entry.customer_name}` : ""}
                </p>

              </div>

              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-success/20 px-2.5 py-1 text-xs font-medium text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                {formatMinutes((Date.now() - new Date(entry.clock_in_at).getTime()) / 60000)}
              </span>

            </div>

          ))}

        </div>

      )}

    </div>

  );

}

export default ClockedInPanel;
