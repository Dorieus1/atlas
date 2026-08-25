const { parse } = require("csv-parse/sync");

const { createCustomer, getCustomerByEmail } = require("./customerService");


// The row cap covers only data rows (the header row doesn't count against
// it) - a customer list CSV from another CRM/spreadsheet/QuickBooks export
// should never need to be bigger than this for a v1 bulk import.
const MAX_ROWS = 1000;


// A small lookup table of accepted header aliases per field, not a
// fuzzy-matching NLP system - deliberately simple per the task's design
// notes. Keys are compared case-insensitively (and trimmed) against the
// header row.
const HEADER_ALIASES = {

  name: ["name", "full name", "customer name"],
  email: ["email", "email address"],
  phone: ["phone", "phone number", "mobile"]

};


const normalizeHeader = (value) => String(value || "").trim().toLowerCase();


// Given the raw header row (array of strings), figures out which column
// index maps to which of our three known fields. Returns
// { name: idx|undefined, email: idx|undefined, phone: idx|undefined }.
// The first matching column wins if a header row somehow has more than one
// alias for the same field.
const matchColumns = (headerRow) => {

  const columns = {};

  headerRow.forEach((rawHeader, index) => {

    const normalized = normalizeHeader(rawHeader);

    for (const field of Object.keys(HEADER_ALIASES)) {

      if (columns[field] !== undefined) {
        continue;
      }

      if (HEADER_ALIASES[field].includes(normalized)) {
        columns[field] = index;
      }

    }

  });

  return columns;

};


// Parses a CSV file buffer and imports customers for the given business.
// created_by_user_id/created_by_name are attributed to every created
// customer, exactly like a manually-added customer via the "Add Customer"
// form.
//
// Returns a summary object:
// {
//   total_rows,
//   created,
//   skipped_duplicates: [{ row, name, email }],
//   skipped_missing_name: [{ row }]
// }
//
// Throws an Error (with a `.statusCode` of 400) for whole-file problems:
// unparseable CSV, no recognizable name column, or too many data rows.
const importCustomersFromCsv = async (
  business_id,
  fileBuffer,
  created_by_user_id,
  created_by_name
) => {

  let records;

  try {

    records = parse(fileBuffer, {
      skip_empty_lines: true,
      bom: true
    });

  } catch (parseError) {

    const error = new Error("Couldn't read that file as CSV. Please check the format and try again.");
    error.statusCode = 400;
    throw error;

  }

  if (records.length === 0) {

    const error = new Error("That CSV file is empty.");
    error.statusCode = 400;
    throw error;

  }

  const [headerRow, ...dataRows] = records;

  const columns = matchColumns(headerRow);

  if (columns.name === undefined) {

    const error = new Error(
      "Couldn't find a name column in that CSV. Expected a header like \"Name\", \"Full Name\", or \"Customer Name\"."
    );
    error.statusCode = 400;
    throw error;

  }

  if (dataRows.length > MAX_ROWS) {

    const error = new Error(
      `That CSV has too many rows (${dataRows.length}). Please split it into files of ${MAX_ROWS} customers or fewer.`
    );
    error.statusCode = 400;
    throw error;

  }

  const summary = {
    total_rows: dataRows.length,
    created: 0,
    skipped_duplicates: [],
    skipped_missing_name: []
  };

  // Sequential, not Promise.all - each row potentially does a duplicate
  // lookup followed by an insert, and running those concurrently against
  // sqlite3's single connection wouldn't meaningfully speed anything up
  // while making the row-number-in-results bookkeeping harder to trust.
  for (let i = 0; i < dataRows.length; i++) {

    const row = dataRows[i];
    // +2: +1 to move from a 0-based index to a 1-based row number, +1
    // more because the header row itself was row 1 in the original file.
    const rowNumber = i + 2;

    const rawName = columns.name !== undefined ? row[columns.name] : undefined;
    const name = rawName ? String(rawName).trim() : "";

    if (!name) {

      summary.skipped_missing_name.push({ row: rowNumber });
      continue;

    }

    const rawEmail = columns.email !== undefined ? row[columns.email] : undefined;
    const email = rawEmail ? String(rawEmail).trim() : "";

    const rawPhone = columns.phone !== undefined ? row[columns.phone] : undefined;
    const phone = rawPhone ? String(rawPhone).trim() : "";

    if (email) {

      const existing = await getCustomerByEmail(business_id, email);

      if (existing) {

        summary.skipped_duplicates.push({ row: rowNumber, name, email });
        continue;

      }

    }

    await createCustomer(
      business_id,
      name,
      email || null,
      phone || null,
      created_by_user_id || null,
      created_by_name || null
    );

    summary.created += 1;

  }

  return summary;

};


module.exports = {
  MAX_ROWS,
  HEADER_ALIASES,
  matchColumns,
  importCustomersFromCsv
};
