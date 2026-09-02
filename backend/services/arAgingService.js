const { getQuotesForExport, getQuotePaymentsForQuoteIds } = require("./quoteService");


const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Matches the grace period already used elsewhere for "is this invoice
// overdue" (Quotes.jsx's own OVERDUE_AFTER_DAYS, and the first automated
// reminder in invoiceReminderService.js) - an invoice isn't considered
// late until a few days have actually passed, not the instant it's sent.
const OVERDUE_GRACE_DAYS = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Standard accounts-receivable aging buckets, keyed by days PAST the
// grace period above - "Current" isn't overdue at all yet.
const BUCKET_DEFS = [
  { key: "current", label: "Current", min: -Infinity, max: 0 },
  { key: "days_1_30", label: "1-30 days overdue", min: 1, max: 30 },
  { key: "days_31_60", label: "31-60 days overdue", min: 31, max: 60 },
  { key: "days_61_90", label: "61-90 days overdue", min: 61, max: 90 },
  { key: "days_90_plus", label: "90+ days overdue", min: 91, max: Infinity }
];

function bucketFor(daysOverdue) {

  return BUCKET_DEFS.find((bucket) => daysOverdue >= bucket.min && daysOverdue <= bucket.max).key;

}


// The one number this whole report exists to answer, per invoice: what's
// actually still owed on it right now. Combines both ways money can
// already be recorded against a quote - the same two used by
// getQuoteById (a Stripe deposit, and any manually-logged payment) -
// since an invoice paid down 50% by a cash deposit still owes the other
// 50%, not its full total.
function computeBalanceDue(invoice, payments) {

  const manualPaymentsTotal = round2(payments.reduce((sum, payment) => sum + payment.amount, 0));
  const depositCollected = invoice.deposit_paid_at ? invoice.deposit_amount : 0;
  const amountPaid = round2(depositCollected + manualPaymentsTotal);

  return Math.max(0, round2(invoice.total - amountPaid));

}


// Every business's outstanding (unpaid or partially-paid) invoice,
// grouped by customer, with each invoice's balance bucketed by how
// overdue it is. Quotes (not yet invoices) are deliberately excluded -
// "accounts receivable" is money actually owed for work billed, not a
// price still being decided on.
const getArAging = async (business_id) => {

  const invoices = await getQuotesForExport(business_id, { type: "invoice" });

  // "paid" is already excluded by balance_due <= 0 in the overwhelming
  // case, but checked explicitly too - a quote can be marked paid via a
  // path that doesn't perfectly reconcile balance_due to exactly zero
  // (a manual override, floating-point noise), and a business's AR
  // report should never show a business owner's OWN "this is paid"
  // determination as still outstanding.
  const outstandingCandidates = invoices.filter(
    (invoice) => invoice.status === "sent" || invoice.status === "accepted"
  );

  const invoiceIds = outstandingCandidates.map((invoice) => invoice.id);
  const allPayments = await getQuotePaymentsForQuoteIds(invoiceIds);

  const paymentsByInvoiceId = {};

  for (const payment of allPayments) {

    if (!paymentsByInvoiceId[payment.quote_id]) {
      paymentsByInvoiceId[payment.quote_id] = [];
    }

    paymentsByInvoiceId[payment.quote_id].push(payment);

  }

  const now = Date.now();

  const outstandingInvoices = outstandingCandidates
    .map((invoice) => {

      const balance_due = computeBalanceDue(invoice, paymentsByInvoiceId[invoice.id] || []);

      // sent_at is guaranteed once status is "sent"/"accepted" -
      // updateQuoteFields stamps it the first time a quote transitions
      // to "sent", and nothing un-sends a quote afterward.
      const daysOverdue = Math.floor((now - new Date(invoice.sent_at).getTime()) / MS_PER_DAY) - OVERDUE_GRACE_DAYS;

      return {
        id: invoice.id,
        customer_id: invoice.customer_id,
        customer_name: invoice.customer_name,
        quote_number: invoice.quote_number,
        sent_at: invoice.sent_at,
        total: invoice.total,
        balance_due,
        days_overdue: Math.max(0, daysOverdue),
        bucket: bucketFor(daysOverdue)
      };

    })
    .filter((invoice) => invoice.balance_due > 0);

  const customerMap = new Map();

  for (const invoice of outstandingInvoices) {

    if (!customerMap.has(invoice.customer_id)) {

      customerMap.set(invoice.customer_id, {
        customer_id: invoice.customer_id,
        customer_name: invoice.customer_name,
        total_outstanding: 0,
        buckets: Object.fromEntries(BUCKET_DEFS.map((bucket) => [bucket.key, 0])),
        invoices: []
      });

    }

    const entry = customerMap.get(invoice.customer_id);

    entry.total_outstanding = round2(entry.total_outstanding + invoice.balance_due);
    entry.buckets[invoice.bucket] = round2(entry.buckets[invoice.bucket] + invoice.balance_due);
    entry.invoices.push(invoice);

  }

  const customers = Array.from(customerMap.values()).sort((a, b) => b.total_outstanding - a.total_outstanding);

  const totals = {
    total_outstanding: round2(customers.reduce((sum, customer) => sum + customer.total_outstanding, 0)),
    buckets: Object.fromEntries(BUCKET_DEFS.map((bucket) => [
      bucket.key,
      round2(customers.reduce((sum, customer) => sum + customer.buckets[bucket.key], 0))
    ]))
  };

  return {
    bucket_labels: Object.fromEntries(BUCKET_DEFS.map((bucket) => [bucket.key, bucket.label])),
    totals,
    customers
  };

};


module.exports = {
  getArAging,
  BUCKET_DEFS
};
