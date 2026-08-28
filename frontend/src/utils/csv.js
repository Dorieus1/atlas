// A field starting with =, +, -, or @ gets a leading single-quote before
// the usual quote-escaping - some of this data (customer name, in
// particular) is attacker-controllable end to end via the public,
// unauthenticated chat widget, and Excel/Sheets will otherwise treat a
// leading = (or +/-/@, which Excel also treats as formula-triggering) as
// a formula to evaluate on open (CSV/formula injection, CWE-1236).
// Mirrors backend/services/csvService.js's escapeCsvField, which got
// this same fix - this is a separate, parallel implementation used by
// client-side CSV exports (Customers, Leads, Knowledge), not shared code
// with the backend's own CSV exports.
const escapeCsvValue = (value) => {

  let str = value === null || value === undefined ? "" : String(value);

  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }

  // \r was missing here (a review pass caught it) - the backend twin,
  // csvService.js's escapeCsvField, already covers it. A bare carriage
  // return in a field (e.g. a customer name pasted from somewhere with
  // Windows-style line endings) would go out unquoted and break row
  // alignment in any parser that treats \r as its own line terminator.
  if (/[",\n\r]/.test(str)) {

    return `"${str.replace(/"/g, '""')}"`;

  }

  return str;

};


export const downloadCSV = (filename, columns, rows) => {

  const header = columns.map((col) => escapeCsvValue(col.label)).join(",");

  const lines = rows.map((row) =>
    columns.map((col) => escapeCsvValue(row[col.key])).join(",")
  );

  const csv = [header, ...lines].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);

};
