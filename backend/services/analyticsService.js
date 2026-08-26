const db = require("../../database/db");


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
    revenuePaid,
    revenueOutstanding,
    paidInvoices,
    outstandingInvoices,
    monthlyRows,
    expensesPaid
  ] = await Promise.all([

    getAsync(`SELECT COUNT(*) as count FROM customers WHERE business_id = ? AND deleted_at IS NULL`, [business_id]),

    getAsync(`SELECT COUNT(*) as count FROM leads WHERE business_id = ?`, [business_id]),

    getAsync(`SELECT COUNT(*) as count FROM leads WHERE business_id = ? AND priority = 'hot'`, [business_id]),

    // Real pipeline stages, not just a total - lets the frontend show an
    // actual funnel (new -> contacted -> qualified -> closed) instead of
    // re-plotting the same totals the top-level stat cards already show.
    allAsync(`SELECT status, COUNT(*) as count FROM leads WHERE business_id = ? GROUP BY status`, [business_id]),

    getAsync(

      `
      SELECT COALESCE(SUM(quote_items.quantity * quote_items.unit_price), 0) as total
      FROM quotes
      JOIN quote_items ON quote_items.quote_id = quotes.id
      WHERE quotes.business_id = ?
      AND quotes.type = 'invoice'
      AND quotes.status = 'paid'
      `,

      [business_id]

    ),

    getAsync(

      `
      SELECT COALESCE(SUM(quote_items.quantity * quote_items.unit_price), 0) as total
      FROM quotes
      JOIN quote_items ON quote_items.quote_id = quotes.id
      WHERE quotes.business_id = ?
      AND quotes.type = 'invoice'
      AND quotes.status IN ('sent', 'accepted')
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

    allAsync(

      `
      SELECT
        strftime('%Y-%m', quotes.paid_at) as month,
        COALESCE(SUM(quote_items.quantity * quote_items.unit_price), 0) as total
      FROM quotes
      JOIN quote_items ON quote_items.quote_id = quotes.id
      WHERE quotes.business_id = ?
      AND quotes.type = 'invoice'
      AND quotes.status = 'paid'
      AND quotes.paid_at IS NOT NULL
      GROUP BY month
      `,

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

  const totalsByMonth = {};

  monthlyRows.forEach((row) => {
    totalsByMonth[row.month] = row.total;
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

    revenuePaid: revenuePaid.total,
    revenueOutstanding: revenueOutstanding.total,
    paidInvoiceCount: paidInvoices.count,
    outstandingInvoiceCount: outstandingInvoices.count,
    revenueByMonth,

    expensesPaid: expensesPaid.total,
    totalMargin: revenuePaid.total - expensesPaid.total

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
