const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");
const { withTransaction } = require("../../database/transactionQueue");


const runAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {

    db.run(sql, params, function (err) {

      if (err) {
        reject(err);
      } else {
        resolve(this);
      }

    });

  });

};


const allAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {

    db.all(sql, params, (err, rows) => {

      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }

    });

  });

};


const getAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {

    db.get(sql, params, (err, row) => {

      if (err) {
        reject(err);
      } else {
        resolve(row);
      }

    });

  });

};



// withTransaction is imported from database/transactionQueue.js - it
// serializes every BEGIN/COMMIT transaction across the WHOLE app (not
// just this file) against the shared sqlite3 connection, which is never
// opened in serialized mode. See that file for the full explanation.


// "Q-1001" / "INV-1002" - the human-readable form of a quote/invoice's
// sequential quote_number. Centralized here so the type-prefix convention
// lives in one place instead of being re-implemented in the API responses,
// the PDF, and every frontend view that shows a quote/invoice number.
const formatQuoteNumber = (type, quote_number) => {

  if (quote_number === null || quote_number === undefined) {
    return null;
  }

  const prefix = type === "invoice" ? "INV" : "Q";

  return `${prefix}-${quote_number}`;

};



// Atomically reads-and-increments the business's shared quote/invoice
// counter, returning the number to assign to the new quote. This has to
// be safe against two quotes being created for the same business at
// nearly the same instant (two browser tabs, a retried request, etc).
//
// The read and the write happen as a SINGLE SQL statement
// (UPDATE ... RETURNING) rather than a separate SELECT followed by an
// UPDATE. That single-statement shape is what makes it safe here: SQLite
// executes one statement against a connection as one atomic unit, so
// there is no window between "read the current value" and "write the
// incremented value" for a second call to read the same stale number -
// even though this connection isn't in serialized mode and two calls can
// be in flight at once. This was verified directly (30 concurrent calls
// against a real file-backed db produced 30 unique, gapless numbers) -
// see quoteNumbers.test.js for the equivalent test through the real API.
// RETURNING requires SQLite 3.35+; the sqlite3 driver here (v6.0.1) bundles
// SQLite 3.52, confirmed by running this exact query against it directly.
const assignNextQuoteNumber = async (business_id) => {

  const row = await getAsync(

    `
    UPDATE businesses
    SET next_quote_number = next_quote_number + 1
    WHERE id = ?
    RETURNING next_quote_number - 1 AS quote_number
    `,

    [business_id]

  );

  if (!row) {
    throw new Error("Cannot assign a quote number for an unknown business");
  }

  return row.quote_number;

};



const createQuote = async (

  business_id,
  customer_id,
  type,
  notes,
  items,
  appointment_id = null,
  created_by_user_id = null,
  created_by_name = null

) => {

  const id = uuidv4();

  // Assigned before the insert transaction below. It's already safe on
  // its own (see assignNextQuoteNumber) without needing the transaction
  // mutex - it doesn't matter if two concurrent creates interleave their
  // number assignment relative to their inserts, only that each gets a
  // unique number and neither insert is lost.
  const quote_number = await assignNextQuoteNumber(business_id);

  return withTransaction(async () => {

    await runAsync("BEGIN TRANSACTION");

    try {

      await runAsync(

        `
        INSERT INTO quotes
        (id, business_id, customer_id, type, notes, appointment_id, quote_number, created_by_user_id, created_by_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,

        [
          id,
          business_id,
          customer_id,
          type,
          notes || null,
          appointment_id,
          quote_number,
          created_by_user_id || null,
          created_by_name || null
        ]

      );

      for (const item of items) {

        await runAsync(

          `
          INSERT INTO quote_items
          (id, quote_id, description, quantity, unit_price)
          VALUES (?, ?, ?, ?, ?)
          `,

          [uuidv4(), id, item.description, item.quantity, item.unit_price]

        );

      }

      await runAsync("COMMIT");

      return { id, quote_number };

    } catch (err) {

      await runAsync("ROLLBACK").catch(() => {});

      throw err;

    }

  });

};



const getQuoteByAppointmentId = (appointment_id, business_id) => {

  return getAsync(

    `
    SELECT id
    FROM quotes
    WHERE appointment_id = ?
    AND business_id = ?
    `,

    [appointment_id, business_id]

  );

};



const getQuotes = (business_id) => {

  return allAsync(

    `
    SELECT
      quotes.*,
      customers.name AS customer_name,
      COALESCE(SUM(quote_items.quantity * quote_items.unit_price), 0) AS total
    FROM quotes
    LEFT JOIN customers ON customers.id = quotes.customer_id
    LEFT JOIN quote_items ON quote_items.quote_id = quotes.id
    WHERE quotes.business_id = ?
    GROUP BY quotes.id
    ORDER BY quotes.created_at DESC
    `,

    [business_id]

  );

};



// Powers the CSV export - like getQuotes() but with the customer's email
// (bookkeeping needs a way to reach the customer, not just their name) and
// optional type/status filtering so an accountant can pull just invoices,
// or just paid ones, instead of the whole history every time.
const getQuotesForExport = (business_id, { type, status } = {}) => {

  const conditions = ["quotes.business_id = ?"];
  const params = [business_id];

  if (type) {
    conditions.push("quotes.type = ?");
    params.push(type);
  }

  if (status) {
    conditions.push("quotes.status = ?");
    params.push(status);
  }

  return allAsync(

    `
    SELECT
      quotes.*,
      customers.name AS customer_name,
      customers.email AS customer_email,
      COALESCE(SUM(quote_items.quantity * quote_items.unit_price), 0) AS total
    FROM quotes
    LEFT JOIN customers ON customers.id = quotes.customer_id
    LEFT JOIN quote_items ON quote_items.quote_id = quotes.id
    WHERE ${conditions.join(" AND ")}
    GROUP BY quotes.id
    ORDER BY quotes.created_at DESC
    `,

    params

  );

};



const getQuoteItemsForQuoteIds = async (quoteIds) => {

  if (quoteIds.length === 0) {
    return [];
  }

  const placeholders = quoteIds.map(() => "?").join(", ");

  return allAsync(

    `
    SELECT *
    FROM quote_items
    WHERE quote_id IN (${placeholders})
    ORDER BY created_at ASC
    `,

    quoteIds

  );

};



const getQuotesByCustomer = (customer_id, business_id) => {

  return allAsync(

    `
    SELECT
      quotes.*,
      COALESCE(SUM(quote_items.quantity * quote_items.unit_price), 0) AS total
    FROM quotes
    LEFT JOIN quote_items ON quote_items.quote_id = quotes.id
    WHERE quotes.customer_id = ?
    AND quotes.business_id = ?
    GROUP BY quotes.id
    ORDER BY quotes.created_at DESC
    `,

    [customer_id, business_id]

  );

};



const getQuoteById = async (id, business_id) => {

  const quote = await getAsync(

    `
    SELECT
      quotes.*,
      customers.name AS customer_name
    FROM quotes
    LEFT JOIN customers ON customers.id = quotes.customer_id
    WHERE quotes.id = ?
    AND quotes.business_id = ?
    `,

    [id, business_id]

  );

  if (!quote) {
    return null;
  }

  const items = await allAsync(

    `
    SELECT *
    FROM quote_items
    WHERE quote_id = ?
    ORDER BY created_at ASC
    `,

    [id]

  );

  quote.items = items;

  quote.total = items.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );

  return quote;

};



const updateQuoteFields = async (id, business_id, fields) => {

  const existing = await getAsync(

    `SELECT id, sent_at FROM quotes WHERE id = ? AND business_id = ?`,

    [id, business_id]

  );

  if (!existing) {
    return false;
  }

  const fieldsWithTimestamps = { ...fields };

  // First time a quote/invoice transitions to "sent", stamp sent_at - this
  // is what the invoice-reminder job uses to know when the 3-day countdown
  // to a first reminder starts. Only set it once; re-saving an already-sent
  // quote must not push the clock forward.
  if (fieldsWithTimestamps.status === "sent" && !existing.sent_at) {
    fieldsWithTimestamps.sent_at = new Date().toISOString();
  }

  const setClauses = [];
  const values = [];

  for (const [key, value] of Object.entries(fieldsWithTimestamps)) {
    setClauses.push(`${key} = ?`);
    values.push(value);
  }

  if (setClauses.length === 0) {
    return true;
  }

  values.push(id, business_id);

  await runAsync(

    `
    UPDATE quotes
    SET ${setClauses.join(", ")}
    WHERE id = ?
    AND business_id = ?
    `,

    values

  );

  return true;

};



const replaceQuoteItems = async (id, business_id, items) => {

  const existing = await getAsync(

    `SELECT id FROM quotes WHERE id = ? AND business_id = ?`,

    [id, business_id]

  );

  if (!existing) {
    return false;
  }

  return withTransaction(async () => {

    await runAsync("BEGIN TRANSACTION");

    try {

      await runAsync(`DELETE FROM quote_items WHERE quote_id = ?`, [id]);

      for (const item of items) {

        await runAsync(

          `
          INSERT INTO quote_items
          (id, quote_id, description, quantity, unit_price)
          VALUES (?, ?, ?, ?, ?)
          `,

          [uuidv4(), id, item.description, item.quantity, item.unit_price]

        );

      }

      await runAsync("COMMIT");

      return true;

    } catch (err) {

      await runAsync("ROLLBACK").catch(() => {});

      throw err;

    }

  });

};



const deleteQuote = async (id, business_id) => {

  return withTransaction(async () => {

    await runAsync("BEGIN TRANSACTION");

    try {

      await runAsync(`DELETE FROM quote_items WHERE quote_id = ?`, [id]);

      const result = await runAsync(

        `
        DELETE FROM quotes
        WHERE id = ?
        AND business_id = ?
        `,

        [id, business_id]

      );

      await runAsync("COMMIT");

      return result.changes > 0;

    } catch (err) {

      await runAsync("ROLLBACK").catch(() => {});

      throw err;

    }

  });

};



module.exports = {

  createQuote,

  formatQuoteNumber,

  assignNextQuoteNumber,

  getQuoteByAppointmentId,

  getQuotes,

  getQuotesForExport,

  getQuoteItemsForQuoteIds,

  getQuotesByCustomer,

  getQuoteById,

  updateQuoteFields,

  replaceQuoteItems,

  deleteQuote

};
