const db = require("../../database/db");
const { applyDiscount } = require("./quoteService");


const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;


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
    paidQuoteRows,
    outstandingQuoteRows,
    paidInvoices,
    outstandingInvoices,
    expensesPaid
  ] = await Promise.all([

    getAsync(`SELECT COUNT(*) as count FROM customers WHERE business_id = ? AND deleted_at IS NULL`, [business_id]),

    getAsync(`SELECT COUNT(*) as count FROM leads WHERE business_id = ?`, [business_id]),

    getAsync(`SELECT COUNT(*) as count FROM leads WHERE business_id = ? AND priority = 'hot'`, [business_id]),

    // Real pipeline stages, not just a total - lets the frontend show an
    // actual funnel (new -> contacted -> qualified -> closed) instead of
    // re-plotting the same totals the top-level stat cards already show.
    allAsync(`SELECT status, COUNT(*) as count FROM leads WHERE business_id = ? GROUP BY status`, [business_id]),

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

  return {

    customers: customers.count,
    leads: leads.count,
    hotLeads: hotLeads.count,
    leadsByStatus,

    revenuePaid: revenuePaidTotal,
    revenueOutstanding: revenueOutstandingTotal,
    paidInvoiceCount: paidInvoices.count,
    outstandingInvoiceCount: outstandingInvoices.count,
    revenueByMonth,

    expensesPaid: expensesPaid.total,
    totalMargin: round2(revenuePaidTotal - expensesPaid.total),

    repeatCustomerRate,
    avgCustomerValue

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
