const db = require("../../database/db");
const { applyDiscount } = require("./quoteService");


const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;


// A plan's price is per-visit, not per-month, so "recurring revenue"
// needs a monthly-equivalent conversion before it can be summed across
// plans on different cadences - a $100 weekly plan and a $100 monthly
// plan are not worth the same amount. Average weeks/months-per-year
// (52/12, 26/12) rather than a fixed "4 visits" assumption, so this
// doesn't systematically overstate a weekly plan's monthly value.
const MONTHLY_EQUIVALENT_MULTIPLIER = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  annually: 1 / 12
};


const getAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {

    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));

  });

};


const allAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {

    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));

  });

};


// Last 6 calendar months including the current one, oldest first, so a
// month with zero paid invoices still shows up as a $0 bar instead of a
// gap - a business with a slow month should see that clearly, not have
// it silently disappear from the chart.
function lastSixMonthKeys() {

  const months = [];
  const now = new Date();

  // Built entirely in UTC to match how paid_at is stored (new
  // Date().toISOString(), UTC) and read (SQLite's strftime, which reads
  // that UTC string as-is). Mixing in local-time arithmetic here would
  // shift every key by a day in any positive-UTC-offset timezone,
  // silently misaligning the whole chart against the SQL-computed data.
  for (let i = 5; i >= 0; i--) {

    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(d.toISOString().slice(0, 7));

  }

  return months;

}



const getAnalytics = async (business_id) => {

  const [
    customers,
    leads,
    hotLeads,
    leadsByStatusRows,
    leadsBySourceRows,
    paidQuoteRows,
    outstandingQuoteRows,
    paidInvoices,
    outstandingInvoices,
    expensesPaid,
    laborHours,
    business,
    activeServiceAgreementRows
  ] = await Promise.all([

    getAsync(`SELECT COUNT(*) as count FROM customers WHERE business_id = ? AND deleted_at IS NULL`, [business_id]),

    getAsync(`SELECT COUNT(*) as count FROM leads WHERE business_id = ?`, [business_id]),

    getAsync(`SELECT COUNT(*) as count FROM leads WHERE business_id = ? AND priority = 'hot'`, [business_id]),

    // Real pipeline stages, not just a total - lets the frontend show an
    // actual funnel (new -> contacted -> qualified -> closed) instead of
    // re-plotting the same totals the top-level stat cards already show.
    allAsync(`SELECT status, COUNT(*) as count FROM leads WHERE business_id = ? GROUP BY status`, [business_id]),

    // Marketing attribution - an owner deciding where to spend money
    // needs to know which channel actually brings leads in, not just how
    // many leads exist. Grouped in SQL rather than counted client-side
    // since the frontend never needs the raw lead rows for this, only
    // the per-source totals.
    allAsync(`SELECT source, COUNT(*) as count FROM leads WHERE business_id = ? GROUP BY source`, [business_id]),

    // Per-quote subtotal (not a single aggregate SUM) so discount_type/
    // discount_value/tax_rate can be applied per quote in JS below via
    // the same applyDiscount() quoteService.js uses everywhere else - a
    // straight SUM(quantity * unit_price) here would count the pre-
    // discount, pre-tax subtotal as "revenue", overstating or
    // understating it for any discounted/taxed invoice even though
    // Stripe genuinely only charges (and this business only actually
    // collects) the final discounted-and-taxed total.
    allAsync(

      `
      SELECT
        quotes.customer_id,
        quotes.discount_type,
        quotes.discount_value,
        quotes.tax_rate,
        quotes.paid_at,
        COALESCE(SUM(quote_items.quantity * quote_items.unit_price), 0) as subtotal
      FROM quotes
      JOIN quote_items ON quote_items.quote_id = quotes.id
      WHERE quotes.business_id = ?
      AND quotes.type = 'invoice'
      AND quotes.status = 'paid'
      GROUP BY quotes.id
      `,

      [business_id]

    ),

    allAsync(

      `
      SELECT
        quotes.discount_type,
        quotes.discount_value,
        quotes.tax_rate,
        COALESCE(SUM(quote_items.quantity * quote_items.unit_price), 0) as subtotal
      FROM quotes
      JOIN quote_items ON quote_items.quote_id = quotes.id
      WHERE quotes.business_id = ?
      AND quotes.type = 'invoice'
      AND quotes.status IN ('sent', 'accepted')
      GROUP BY quotes.id
      `,

      [business_id]

    ),

    getAsync(

      `SELECT COUNT(*) as count FROM quotes WHERE business_id = ? AND type = 'invoice' AND status = 'paid'`,

      [business_id]

    ),

    getAsync(

      `SELECT COUNT(*) as count FROM quotes WHERE business_id = ? AND type = 'invoice' AND status IN ('sent', 'accepted')`,

      [business_id]

    ),

    // Only counted against PAID invoices, matching revenuePaid's own
    // definition of "real" revenue - an expense logged against a draft
    // or still-outstanding invoice hasn't actually been recovered by
    // anything yet, so it shouldn't be netted against money the
    // business hasn't collected.
    getAsync(

      `
      SELECT COALESCE(SUM(quote_expenses.amount), 0) as total
      FROM quotes
      JOIN quote_expenses ON quote_expenses.quote_id = quotes.id
      WHERE quotes.business_id = ?
      AND quotes.type = 'invoice'
      AND quotes.status = 'paid'
      `,

      [business_id]

    ),

    // Real labor cost, kept as its own transparent figure rather than
    // folded into expensesPaid above - it's counted the moment the work
    // is actually done (clock-out recorded), same as how a real payroll
    // cost is incurred, rather than waiting on the customer's invoice to
    // be paid the way expensesPaid deliberately does. That's a genuine
    // cash-vs-accrual mismatch between the two figures, which is exactly
    // why they're surfaced separately instead of silently merged into
    // one number a business owner can't unpick.
    //
    // status != 'cancelled' was added after a review pass caught its
    // absence: every other money figure on this endpoint is deliberately
    // gated on a real status (revenuePaid on 'paid', expensesPaid on a
    // paid invoice), so a clocked-in-then-called-off job silently
    // dragging down the margin was an inconsistency, not a deliberate
    // accrual choice - the work was never actually completed for the
    // customer, so it shouldn't count as a cost against a job that isn't
    // happening.
    // Sums EVERY team member's own session on a job, not one shared
    // clock per appointment (see migration 059/timeEntryService.js) - a
    // two-person crew on one visit correctly counts as two people's
    // worth of labor hours, not one.
    getAsync(

      `
      SELECT COALESCE(SUM((julianday(time_entries.clock_out_at) - julianday(time_entries.clock_in_at)) * 24), 0) as hours
      FROM time_entries
      JOIN appointments ON appointments.id = time_entries.appointment_id
      WHERE time_entries.business_id = ?
      AND time_entries.clock_out_at IS NOT NULL
      AND appointments.status != 'cancelled'
      `,

      [business_id]

    ),

    getAsync(`SELECT default_hourly_labor_cost FROM businesses WHERE id = ?`, [business_id]),

    // Recurring revenue - a real depth gap found in review: the plans
    // themselves (service_agreements) were fully built and reachable
    // per-customer, but nothing anywhere told an owner how many they
    // have or what they're worth as a whole. Only price/frequency are
    // needed here; the monthly-equivalent conversion happens in JS below
    // since it's the same small lookup table computeMonthlyEquivalent
    // uses for the Plans page display, not something worth a SQL CASE.
    allAsync(
      `SELECT price, frequency FROM service_agreements WHERE business_id = ? AND status = 'active'`,
      [business_id]
    )

  ]);

  // Each row's own discount applied here, in JS, rather than trusting a
  // single raw SQL SUM - the same applyDiscount() every other real-money
  // computation in this codebase (quoteService.js, the PDF, the CSV
  // export) already uses, so "revenue" always means what was actually
  // billed/collected, not the pre-discount subtotal.
  const paidTotals = paidQuoteRows.map((row) => ({

    customerId: row.customer_id,
    paidAt: row.paid_at,
    total: applyDiscount(row.subtotal, row.discount_type, row.discount_value, row.tax_rate).total

  }));

  const revenuePaidTotal = round2(paidTotals.reduce((sum, row) => sum + row.total, 0));

  // Repeat-customer rate and CLV both need "how many paid invoices, and
  // how much, per customer" - built once here from the same per-quote
  // paidTotals above rather than a second query, so there's exactly one
  // definition of "revenue collected" (applyDiscount'd, per quote) behind
  // every money figure this endpoint returns.
  const revenueByCustomer = {};

  paidTotals.forEach((row) => {

    if (!row.customerId) {
      return;
    }

    if (!revenueByCustomer[row.customerId]) {
      revenueByCustomer[row.customerId] = { invoiceCount: 0, total: 0 };
    }

    revenueByCustomer[row.customerId].invoiceCount += 1;
    revenueByCustomer[row.customerId].total += row.total;

  });

  const payingCustomers = Object.values(revenueByCustomer);
  const repeatCustomers = payingCustomers.filter((c) => c.invoiceCount >= 2);

  // Standard repeat-purchase-rate definition: of everyone who has ever
  // paid at least once, what share came back and paid again. A business
  // with zero paying customers yet reports 0%, not NaN/Infinity.
  const repeatCustomerRate = payingCustomers.length > 0
    ? round2((repeatCustomers.length / payingCustomers.length) * 100)
    : 0;

  // Average lifetime value per paying customer - total collected revenue
  // divided across the customers who actually generated it, not the
  // business's whole customer list (a customer who's never paid
  // shouldn't dilute the average toward a number that undersells what a
  // real paying customer is worth).
  const avgCustomerValue = payingCustomers.length > 0
    ? round2(revenuePaidTotal / payingCustomers.length)
    : 0;

  const revenueOutstandingTotal = round2(

    outstandingQuoteRows.reduce(
      (sum, row) => sum + applyDiscount(row.subtotal, row.discount_type, row.discount_value, row.tax_rate).total,
      0
    )

  );

  const totalsByMonth = {};

  // paid_at is stored as an ISO string (new Date().toISOString(), UTC) -
  // slicing its first 7 characters ("YYYY-MM") reads the same UTC
  // year-month strftime('%Y-%m', ...) used to compute, without needing
  // SQL to do it since these totals are now computed in JS per-quote.
  paidTotals.forEach((row) => {

    if (!row.paidAt) {
      return;
    }

    const month = row.paidAt.slice(0, 7);
    totalsByMonth[month] = round2((totalsByMonth[month] || 0) + row.total);

  });

  const revenueByMonth = lastSixMonthKeys().map((month) => ({
    month,
    total: totalsByMonth[month] || 0
  }));

  // Always all four keys, even at 0 - a business with no "qualified"
  // leads yet should see an empty stage in the funnel, not a missing
  // one, so the shape of the funnel is stable regardless of what's
  // actually in the data.
  const leadsByStatus = { new: 0, contacted: 0, qualified: 0, closed: 0 };

  leadsByStatusRows.forEach((row) => {

    const status = row.status || "new";

    if (Object.prototype.hasOwnProperty.call(leadsByStatus, status)) {
      leadsByStatus[status] = row.count;
    }

  });

  // Human-readable labels live here, not in the raw DB value, so a
  // renamed/relabeled source in the future doesn't require a data
  // migration - "Not set" covers both an explicit null and any lead
  // created before this field existed.
  const SOURCE_LABELS = {
    google: "Google",
    referral: "Referral",
    social_media: "Social Media",
    yard_sign_vehicle: "Yard Sign / Vehicle",
    repeat_customer: "Repeat Customer",
    website: "Website",
    other: "Other"
  };

  const leadsBySource = leadsBySourceRows.map((row) => ({
    source: row.source || "not_set",
    label: SOURCE_LABELS[row.source] || "Not set",
    count: row.count
  }));

  // null (not 0) when no rate has ever been set - a business that
  // hasn't told us what labor costs shouldn't have its margin quietly
  // treated as "labor is free" just because clock-in/out is being used.
  const hourlyLaborCost = business && business.default_hourly_labor_cost != null
    ? business.default_hourly_labor_cost
    : null;

  const laborCostTotal = hourlyLaborCost != null
    ? round2(laborHours.hours * hourlyLaborCost)
    : 0;

  // Plans with no price set contribute 0 - "recurring revenue" can only
  // ever mean money, and a priceless plan (a courtesy check-in, say)
  // isn't that, even though it's still a perfectly real active plan and
  // still counts toward activeServiceAgreements below.
  const monthlyRecurringRevenue = round2(

    activeServiceAgreementRows.reduce((sum, row) => {

      if (row.price == null) {
        return sum;
      }

      return sum + row.price * (MONTHLY_EQUIVALENT_MULTIPLIER[row.frequency] || 0);

    }, 0)

  );

  return {

    customers: customers.count,
    leads: leads.count,
    hotLeads: hotLeads.count,
    leadsByStatus,
    leadsBySource,

    revenuePaid: revenuePaidTotal,
    revenueOutstanding: revenueOutstandingTotal,
    paidInvoiceCount: paidInvoices.count,
    outstandingInvoiceCount: outstandingInvoices.count,
    revenueByMonth,

    expensesPaid: expensesPaid.total,
    laborCost: laborCostTotal,
    laborHours: round2(laborHours.hours),
    hourlyLaborCost,
    totalMargin: round2(revenuePaidTotal - expensesPaid.total - laborCostTotal),

    repeatCustomerRate,
    avgCustomerValue,

    activeServiceAgreements: activeServiceAgreementRows.length,
    monthlyRecurringRevenue

  };

};



module.exports = {

  getAnalytics,

  // Exported for a direct, deterministic unit test - mutating
  // process.env.TZ mid-process to emulate a different timezone isn't
  // reliably respected by Node's Date internals, so the real way to
  // pin this down is to fix "now" with fake timers and assert the UTC
  // keys directly, independent of the host's actual timezone.
  lastSixMonthKeys

};
