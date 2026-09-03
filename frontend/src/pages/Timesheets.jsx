import { useEffect, useState } from "react";
import { Clock, DollarSign, Download } from "lucide-react";

import { getTimesheets, exportTimesheetsCsv } from "../api/atlasApi";

import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import StatCard from "../components/dashboard/StatCard";
import { formatMoney } from "../utils/serviceAgreements";


// Same local-calendar-day logic Today.jsx/Schedule.jsx/CustomerTimeline.jsx
// each keep their own copy of, for the same reason: a date input's value
// has to match the business owner's own calendar day, not get shifted by
// a UTC conversion.
function toDateKey(date) {

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;

}


// offsetWeeks: 0 = this week, -1 = last week, etc. Monday-start, since
// that's the far more common payroll-week convention for an hourly crew
// than a Sunday-start calendar week.
function weekRange(offsetWeeks = 0) {

  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + offsetWeeks * 7);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return { start: toDateKey(monday), end: toDateKey(sunday) };

}


function monthRange() {

  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return { start: toDateKey(first), end: toDateKey(last) };

}


// Owner-only (see routes/timesheets.js) - this is the one report in the
// app that names each teammate right next to their hours and effective
// pay, a level of detail about coworkers that shouldn't be open to every
// staff login the way Analytics' aggregate labor cost already is.
// Hidden from the sidebar for staff (see layout/Sidebar.jsx); a staff
// member who navigates here directly still just sees a plain "only the
// owner" message below, since the real boundary is the 403 the backend
// already enforces.
function Timesheets() {

  const initialRange = weekRange();

  const [start, setStart] = useState(initialRange.start);
  const [end, setEnd] = useState(initialRange.end);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const load = async (rangeStart, rangeEnd) => {

    try {

      setLoading(true);

      const data = await getTimesheets(rangeStart, rangeEnd);

      setReport(data);
      setLoadError("");

    } catch (err) {

      console.error("TIMESHEETS LOAD ERROR:", err);

      setReport(null);

      setLoadError(
        err.status === 403
          ? "Only the business owner can view timesheets."
          : "Couldn't load timesheets. Please try again."
      );

    } finally {

      setLoading(false);

    }

  };

  useEffect(() => {

    load(start, end);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyRange = (range) => {

    setStart(range.start);
    setEnd(range.end);
    load(range.start, range.end);

  };

  const handleExport = async () => {

    try {

      setExporting(true);
      setExportError("");

      await exportTimesheetsCsv(start, end);

    } catch (err) {

      console.error("TIMESHEET EXPORT ERROR:", err);
      setExportError("Couldn't export that CSV. Please try again.");

    } finally {

      setExporting(false);

    }

  };


  return (

    <div className="p-8">

      <h1 className="flex items-center gap-2 text-3xl font-bold">
        <Clock size={28} />
        Timesheets
      </h1>

      <p className="mt-1 mb-6 text-sm text-fg-faint">
        Hours and pay by team member, for whatever period you're running payroll on.
      </p>

      <div className="flex flex-wrap items-end gap-3">

        <div>
          <label className="mb-1 block text-xs font-medium text-fg-muted">From</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-border-strong focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-fg-muted">To</label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-border-strong focus:outline-none"
          />
        </div>

        <button
          onClick={() => load(start, end)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500"
        >
          View
        </button>

        <div className="ml-auto flex gap-2">

          <button
            onClick={() => applyRange(weekRange())}
            className="rounded-lg bg-border px-3 py-2 text-xs font-medium transition hover:bg-border-strong"
          >
            This Week
          </button>

          <button
            onClick={() => applyRange(weekRange(-1))}
            className="rounded-lg bg-border px-3 py-2 text-xs font-medium transition hover:bg-border-strong"
          >
            Last Week
          </button>

          <button
            onClick={() => applyRange(monthRange())}
            className="rounded-lg bg-border px-3 py-2 text-xs font-medium transition hover:bg-border-strong"
          >
            This Month
          </button>

        </div>

      </div>

      {loadError && (
        <p className="mt-4 text-sm text-danger">
          {loadError}
        </p>
      )}

      {exportError && (
        <p className="mt-4 text-sm text-danger">
          {exportError}
        </p>
      )}

      {loading ? (

        <div className="mt-6 flex flex-col gap-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>

      ) : report && (

        <>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">

            <StatCard
              title="Total Hours"
              value={`${report.total_hours}h`}
              icon={<Clock size={20} />}
              description={`${report.people.length} team member${report.people.length === 1 ? "" : "s"} logged time in this range`}
            />

            <StatCard
              title="Total Pay"
              value={report.total_pay ?? 0}
              format={report.hourly_rate != null ? formatMoney : () => "—"}
              icon={<DollarSign size={20} />}
              description={report.hourly_rate != null ? `At $${report.hourly_rate}/hour` : "Set an hourly rate in Settings to see pay here"}
            />

          </div>

          {report.people.length === 0 ? (

            <EmptyState
              icon={Clock}
              title="No logged time in this range"
              description="Once a team member clocks in and out of a job in this date range, it'll show up here."
            />

          ) : (

            <>

              <button
                onClick={handleExport}
                disabled={exporting}
                className="mt-4 flex items-center gap-1.5 rounded-lg bg-border px-3 py-2 text-sm font-medium transition hover:bg-border-strong disabled:opacity-50"
              >
                <Download size={14} />
                {exporting ? "Exporting..." : "Export CSV"}
              </button>

              <div className="mt-4 overflow-x-auto rounded-xl border border-border">

                <table className="w-full text-sm">

                  <thead className="bg-surface-muted text-left text-xs font-semibold uppercase text-fg-faint">
                    <tr>
                      <th className="px-4 py-3">Team Member</th>
                      <th className="px-4 py-3">Sessions</th>
                      <th className="px-4 py-3">Hours</th>
                      <th className="px-4 py-3">Pay</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-border">

                    {report.people.map((person) => (

                      <tr key={person.user_id || "unassigned"}>

                        <td className="px-4 py-3 font-medium">
                          {person.user_name}
                        </td>

                        <td className="px-4 py-3 text-fg-muted">
                          {person.session_count}
                        </td>

                        <td className="px-4 py-3">
                          {person.hours}h
                        </td>

                        <td className="px-4 py-3">
                          {report.hourly_rate != null ? formatMoney(person.hours * report.hourly_rate) : "—"}
                        </td>

                        <td className="px-4 py-3">

                          {person.has_open_session && (
                            <span className="flex w-fit items-center gap-1 rounded-full bg-success/20 px-2 py-0.5 text-[11px] font-medium text-success">
                              <Clock size={11} />
                              On the clock
                            </span>
                          )}

                        </td>

                      </tr>

                    ))}

                  </tbody>

                  <tfoot className="border-t border-border font-semibold">
                    <tr>
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3">{report.total_hours}h</td>
                      <td className="px-4 py-3">{report.total_pay != null ? formatMoney(report.total_pay) : "—"}</td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  </tfoot>

                </table>

              </div>

            </>

          )}

        </>

      )}

    </div>

  );

}

export default Timesheets;
