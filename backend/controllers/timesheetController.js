const { getTimesheetSummary } = require("../services/timeEntryService");
const { getBusinessById } = require("../services/businessService");
const { timesheetToCsv } = require("../services/csvService");


// A year is generous for any real payroll period (weekly/biweekly/
// monthly are the realistic cases) while still bounding the query - the
// same kind of sanity cap MAX_RECURRING_OCCURRENCES puts on recurring
// appointments, here to stop an accidental (or malicious) 50-year-wide
// query from scanning the entire time_entries table for no legitimate
// reason.
const MAX_RANGE_DAYS = 366;


// Shared by both endpoints below - a payroll report and its CSV export
// need to agree on exactly the same date range and validation, or a
// business could end up with numbers on screen that don't match the
// file they just downloaded.
const parseDateRange = (query) => {

  const { start, end } = query;

  if (!start || !end) {
    return { error: "start and end dates are required" };
  }

  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return { error: "start and end must be valid dates (YYYY-MM-DD)" };
  }

  if (endDate < startDate) {
    return { error: "end can't be before start" };
  }

  const rangeDays = (endDate - startDate) / (1000 * 60 * 60 * 24);

  if (rangeDays > MAX_RANGE_DAYS) {
    return { error: `The date range can't exceed ${MAX_RANGE_DAYS} days` };
  }

  return { start, end };

};



const getTimesheets = async (req, res) => {

  try {

    const business_id = req.user.business_id;
    const { start, end, error } = parseDateRange(req.query);

    if (error) {
      return res.status(400).json({ error });
    }

    const [people, business] = await Promise.all([
      getTimesheetSummary(business_id, start, end),
      getBusinessById(business_id)
    ]);

    const hourlyRate = business?.default_hourly_labor_cost ?? null;

    const totalHours = Math.round(people.reduce((sum, person) => sum + person.hours, 0) * 100) / 100;

    res.json({
      start,
      end,
      hourly_rate: hourlyRate,
      people,
      total_hours: totalHours,
      total_pay: hourlyRate != null ? Math.round(totalHours * hourlyRate * 100) / 100 : null
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const exportTimesheetsCsv = async (req, res) => {

  try {

    const business_id = req.user.business_id;
    const { start, end, error } = parseDateRange(req.query);

    if (error) {
      return res.status(400).json({ error });
    }

    const [people, business] = await Promise.all([
      getTimesheetSummary(business_id, start, end),
      getBusinessById(business_id)
    ]);

    const csv = timesheetToCsv(people, business?.default_hourly_labor_cost ?? null);

    // Same filesystem/header-safe slugging as exportQuotesCsv - keeps
    // the two CSV downloads in this app consistent with each other.
    const businessSlug = (business?.name || "atlas")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "atlas";

    const filename = `${businessSlug}-timesheet-${start}-to-${end}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    res.send(csv);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};


module.exports = {
  getTimesheets,
  exportTimesheetsCsv
};
