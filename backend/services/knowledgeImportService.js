const { parse } = require("csv-parse/sync");
const { v4: uuidv4 } = require("uuid");

const db = require("../../database/db");


// Mirrors customerImportService.js's own row cap - a knowledge base CSV
// (exported from a spreadsheet of FAQs, or a competitor's export) should
// never need to be bigger than this for a v1 bulk import.
const MAX_ROWS = 1000;

const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 5000;
const MAX_CATEGORY_LENGTH = 100;


// Same small alias-lookup approach as customerImportService.js's
// HEADER_ALIASES - deliberately simple, not fuzzy matching.
const HEADER_ALIASES = {

  title: ["title", "question", "name"],
  content: ["content", "answer", "body", "text"],
  category: ["category", "group", "section"]

};


const normalizeHeader = (value) => String(value || "").trim().toLowerCase();


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


const insertKnowledgeEntry = (business_id, title, content, category) => {

  return new Promise((resolve, reject) => {

    const id = uuidv4();

    db.run(

      `INSERT INTO knowledge (id, business_id, title, content, category) VALUES (?, ?, ?, ?, ?)`,

      [id, business_id, title, content, category || null],

      (err) => (err ? reject(err) : resolve(id))

    );

  });

};


// Parses a CSV file buffer and creates knowledge entries for the given
// business. Same shape of summary/error contract as
// importCustomersFromCsv, for a consistent experience across both
// import features.
//
// Returns { total_rows, created, skipped_missing_fields: [{row}],
// skipped_too_long: [{row, field}] }. Throws an Error (.statusCode 400)
// for whole-file problems.
const importKnowledgeFromCsv = async (business_id, fileBuffer) => {

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

  if (columns.title === undefined || columns.content === undefined) {

    const error = new Error(
      "Couldn't find both a title and content column in that CSV. Expected headers like \"Title\"/\"Question\" and \"Content\"/\"Answer\"."
    );
    error.statusCode = 400;
    throw error;

  }

  if (dataRows.length > MAX_ROWS) {

    const error = new Error(
      `That CSV has too many rows (${dataRows.length}). Please split it into files of ${MAX_ROWS} entries or fewer.`
    );
    error.statusCode = 400;
    throw error;

  }

  const summary = {
    total_rows: dataRows.length,
    created: 0,
    skipped_missing_fields: [],
    skipped_too_long: []
  };

  for (let i = 0; i < dataRows.length; i++) {

    const row = dataRows[i];
    const rowNumber = i + 2;

    const rawTitle = row[columns.title];
    const title = rawTitle ? String(rawTitle).trim() : "";

    const rawContent = row[columns.content];
    const content = rawContent ? String(rawContent).trim() : "";

    if (!title || !content) {

      summary.skipped_missing_fields.push({ row: rowNumber });
      continue;

    }

    if (title.length > MAX_TITLE_LENGTH || content.length > MAX_CONTENT_LENGTH) {

      summary.skipped_too_long.push({ row: rowNumber, field: title.length > MAX_TITLE_LENGTH ? "title" : "content" });
      continue;

    }

    const rawCategory = columns.category !== undefined ? row[columns.category] : undefined;
    const category = rawCategory ? String(rawCategory).trim().slice(0, MAX_CATEGORY_LENGTH) : null;

    await insertKnowledgeEntry(business_id, title, content, category);

    summary.created += 1;

  }

  return summary;

};


module.exports = {
  MAX_ROWS,
  HEADER_ALIASES,
  matchColumns,
  importKnowledgeFromCsv
};
