// Small hand-rolled CSV helpers. No csv library is in package.json, and
// this file's needs (escape a field, join a row, join rows) don't
// justify adding one - the standard CSV escaping rule is only two
// conditionals: quote the field if it has a comma/quote/newline, and
// double any internal quotes.


// Formats a single value as a CSV field. undefined/null become an empty
// field (not the string "null"/"undefined"). Any value containing a
// comma, double-quote, or newline (\n or \r) is wrapped in double quotes
// with internal double-quotes doubled, per RFC 4180.
//
// A field starting with =, +, -, or @ is also prefixed with a leading
// single-quote before that escaping - some of this data (customer name,
// in particular) is attacker-controllable end to end via the public,
// unauthenticated chat widget, and Excel/Sheets will otherwise treat a
// leading = (or +/-/@, which Excel also treats as formula-triggering) as
// a formula to evaluate on open (CSV/formula injection, CWE-1236). The
// leading quote is the standard mitigation - it forces spreadsheet apps
// to treat the cell as plain text instead.
function escapeCsvField(value) {

  if (value === null || value === undefined) {
    return "";
  }

  let stringValue = String(value);

  if (/^[=+\-@]/.test(stringValue)) {
    stringValue = `'${stringValue}`;
  }

  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;

}


function toCsvRow(values) {
  return values.map(escapeCsvField).join(",");
}


// One row per quote/invoice. Line items are flattened into a single
// human-readable "Items" column (e.g. "Roof inspection x1 @ $150.00; Shingles x4 @ $85.00")
// rather than exploding into one row per line item - bookkeeping/accountant
// use cases (the stated purpose of this export) care about matching a
// quote/invoice total to a payment, not reconciling individual line items,
// and a flattened summary keeps "one CSV row = one quote total" true,
// which is what makes the Total column safe to sum in a spreadsheet.
//
// Job Costs/Margin are included here (unlike the customer-facing PDF,
// which deliberately never shows them) because an accountant/bookkeeper
// - the actual audience for this export - is exactly who needs to see
// real profitability, not just what was billed.
function quotesToCsv(quotes, itemsByQuoteId, expensesByQuoteId = {}) {

  const header = [
    "Type",
    "Status",
    "Customer Name",
    "Customer Email",
    "Items",
    "Total",
    "Job Costs",
    "Margin",
    "Created Date",
    "Paid Date"
  ];

  const lines = [toCsvRow(header)];

  for (const quote of quotes) {

    const items = itemsByQuoteId[quote.id] || [];

    const itemsSummary = items
      .map((item) => {

        const lineTotal = item.quantity * item.unit_price;

        return `${item.description} x${item.quantity} @ $${item.unit_price.toFixed(2)} = $${lineTotal.toFixed(2)}`;

      })
      .join("; ");

    const expenses = expensesByQuoteId[quote.id] || [];
    const jobCosts = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const margin = Number(quote.total) - jobCosts;

    lines.push(toCsvRow([
      quote.type,
      quote.status,
      quote.customer_name || "",
      quote.customer_email || "",
      itemsSummary,
      Number(quote.total).toFixed(2),
      jobCosts.toFixed(2),
      margin.toFixed(2),
      quote.created_at || "",
      quote.paid_at || ""
    ]));

  }

  // \r\n line endings are the CSV convention (RFC 4180) and what
  // spreadsheet apps expect.
  return lines.join("\r\n") + "\r\n";

}


module.exports = {
  escapeCsvField,
  toCsvRow,
  quotesToCsv
};
