const { getCustomerById } = require("./customerService");
const { getQuotesByCustomer, getQuotePaymentsForQuoteIds } = require("./quoteService");


const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;


// A customer statement is a formal "here's everything you've been
// billed and what you still owe" document - scoped to invoices only,
// same as AR aging (see arAgingService.js's own comment): a quote is a
// price still being decided on, not money actually owed yet, so it has
// no place on a statement of account.
const getCustomerStatement = async (customer_id, business_id) => {

  const customer = await getCustomerById(customer_id, business_id);

  if (!customer) {
    return null;
  }

  const allQuotes = await getQuotesByCustomer(customer_id, business_id);

  const invoices = allQuotes
    .filter((quote) => quote.type === "invoice" && quote.status !== "draft" && quote.status !== "declined");

  const invoiceIds = invoices.map((invoice) => invoice.id);
  const allPayments = await getQuotePaymentsForQuoteIds(invoiceIds);

  const paymentsByInvoiceId = {};

  for (const payment of allPayments) {

    if (!paymentsByInvoiceId[payment.quote_id]) {
      paymentsByInvoiceId[payment.quote_id] = [];
    }

    paymentsByInvoiceId[payment.quote_id].push(payment);

  }

  const lineItems = invoices
    .map((invoice) => {

      const payments = paymentsByInvoiceId[invoice.id] || [];
      const manualPaymentsTotal = round2(payments.reduce((sum, payment) => sum + payment.amount, 0));
      const depositCollected = invoice.deposit_paid_at ? invoice.deposit_amount : 0;
      const amount_paid = round2(depositCollected + manualPaymentsTotal);
      const balance_due = Math.max(0, round2(invoice.total - amount_paid));

      return {
        id: invoice.id,
        quote_number: invoice.quote_number,
        status: invoice.status,
        created_at: invoice.created_at,
        sent_at: invoice.sent_at,
        paid_at: invoice.paid_at,
        total: invoice.total,
        amount_paid,
        balance_due
      };

    })
    // Oldest first - a statement reads as a running account history, not
    // a most-recent-activity feed like the owner's own quotes list does.
    // created_at only has whole-SECOND precision (SQLite's
    // CURRENT_TIMESTAMP), so two invoices created in the same second
    // would otherwise sort in an arbitrary, run-to-run-inconsistent
    // order - quote_number (assigned atomically and sequentially per
    // business, see assignNextQuoteNumber) is a reliable tiebreaker that
    // reflects real creation order even at that same-second resolution.
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || a.quote_number - b.quote_number);

  const totals = {
    total_billed: round2(lineItems.reduce((sum, invoice) => sum + invoice.total, 0)),
    total_paid: round2(lineItems.reduce((sum, invoice) => sum + invoice.amount_paid, 0)),
    total_balance_due: round2(lineItems.reduce((sum, invoice) => sum + invoice.balance_due, 0))
  };

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address
    },
    invoices: lineItems,
    totals
  };

};


module.exports = {
  getCustomerStatement
};
