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


// Avoids floating point noise (0.1 + 0.2 style errors) leaking into a
// dollar amount that gets shown to a customer or charged via Stripe.
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;


// The "percent-or-fixed dollar amount of some base number" arithmetic on
// its own - both a discount (a slice of the subtotal) and a deposit (a
// slice of the total) are shaped this way, so this is the one place that
// math lives rather than having applyDiscount() and calculateDeposit()
// below each reimplement it.
const calculatePercentOrFixed = (base, type, value) => {

  if (type === "percent" && value !== null && value !== undefined) {
    return round2(base * (Number(value) / 100));
  }

  if (type === "fixed" && value !== null && value !== undefined) {
    return round2(Number(value));
  }

  return 0;

};


// The discount-amount math on its own, given a subtotal that's already
// known - used by the list endpoints below, which compute their subtotal
// with a SQL SUM rather than loading every quote's line items into JS.
// calculateQuoteTotals() (below) is the items-array-shaped wrapper around
// this same math, so there is still only one place the percent-vs-fixed
// logic itself lives.
const applyDiscount = (subtotal, discount_type, discount_value) => {

  const discount_amount = calculatePercentOrFixed(subtotal, discount_type, discount_value);
  const total = round2(subtotal - discount_amount);

  return { discount_amount, total };

};


// The deposit-amount math, given a quote's final total (after any
// discount) that's already known. A deposit is taken against the total,
// not the subtotal - it's "up-front money toward what the customer will
// actually owe", so a discount has to be baked in first. Shares its
// percent-vs-fixed arithmetic with applyDiscount() above via
// calculatePercentOrFixed() rather than reimplementing it.
const calculateDeposit = (total, deposit_type, deposit_value) => {

  return calculatePercentOrFixed(total, deposit_type, deposit_value);

};


// THE single source of truth for turning a quote's line items plus its
// optional discount into { subtotal, discount_amount, total }. Every
// place in the app that shows or charges a quote's total - the API
// response, the quotes list, the CSV export, the PDF, and the Stripe
// Checkout Session - has to go through this (or applyDiscount() above,
// when only a pre-summed subtotal is available) so a discount can never
// be applied inconsistently between two of those places.
const calculateQuoteTotals = (items, discount_type, discount_value) => {

  const subtotal = round2(
    (items || []).reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  );

  const { discount_amount, total } = applyDiscount(subtotal, discount_type, discount_value);

  return { subtotal, discount_amount, total };

};



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
  created_by_name = null,
  discount_type = null,
  discount_value = null,
  deposit_type = null,
  deposit_value = null

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
        (id, business_id, customer_id, type, notes, appointment_id, quote_number, created_by_user_id, created_by_name, discount_type, discount_value, deposit_type, deposit_value)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          created_by_name || null,
          discount_type || null,
          discount_value === undefined || discount_value === null ? null : Number(discount_value),
          deposit_type || null,
          deposit_value === undefined || deposit_value === null ? null : Number(deposit_value)
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



const getQuotes = async (business_id) => {

  const rows = await allAsync(

    `
    SELECT
      quotes.*,
      customers.name AS customer_name,
      COALESCE(SUM(quote_items.quantity * quote_items.unit_price), 0) AS subtotal
    FROM quotes
    LEFT JOIN customers ON customers.id = quotes.customer_id
    LEFT JOIN quote_items ON quote_items.quote_id = quotes.id
    WHERE quotes.business_id = ?
    GROUP BY quotes.id
    ORDER BY quotes.created_at DESC
    `,

    [business_id]

  );

  return rows.map((row) => {

    const subtotal = round2(row.subtotal);
    const { discount_amount, total } = applyDiscount(subtotal, row.discount_type, row.discount_value);
    const deposit_amount = calculateDeposit(total, row.deposit_type, row.deposit_value);

    return { ...row, subtotal, discount_amount, total, deposit_amount };

  });

};



// Powers the CSV export - like getQuotes() but with the customer's email
// (bookkeeping needs a way to reach the customer, not just their name) and
// optional type/status filtering so an accountant can pull just invoices,
// or just paid ones, instead of the whole history every time.
const getQuotesForExport = async (business_id, { type, status } = {}) => {

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

  const rows = await allAsync(

    `
    SELECT
      quotes.*,
      customers.name AS customer_name,
      customers.email AS customer_email,
      COALESCE(SUM(quote_items.quantity * quote_items.unit_price), 0) AS subtotal
    FROM quotes
    LEFT JOIN customers ON customers.id = quotes.customer_id
    LEFT JOIN quote_items ON quote_items.quote_id = quotes.id
    WHERE ${conditions.join(" AND ")}
    GROUP BY quotes.id
    ORDER BY quotes.created_at DESC
    `,

    params

  );

  return rows.map((row) => {

    const subtotal = round2(row.subtotal);
    const { discount_amount, total } = applyDiscount(subtotal, row.discount_type, row.discount_value);
    const deposit_amount = calculateDeposit(total, row.deposit_type, row.deposit_value);

    return { ...row, subtotal, discount_amount, total, deposit_amount };

  });

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



const getQuotesByCustomer = async (customer_id, business_id) => {

  const rows = await allAsync(

    `
    SELECT
      quotes.*,
      COALESCE(SUM(quote_items.quantity * quote_items.unit_price), 0) AS subtotal
    FROM quotes
    LEFT JOIN quote_items ON quote_items.quote_id = quotes.id
    WHERE quotes.customer_id = ?
    AND quotes.business_id = ?
    GROUP BY quotes.id
    ORDER BY quotes.created_at DESC
    `,

    [customer_id, business_id]

  );

  return rows.map((row) => {

    const subtotal = round2(row.subtotal);
    const { discount_amount, total } = applyDiscount(subtotal, row.discount_type, row.discount_value);
    const deposit_amount = calculateDeposit(total, row.deposit_type, row.deposit_value);

    return { ...row, subtotal, discount_amount, total, deposit_amount };

  });

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

  const totals = calculateQuoteTotals(items, quote.discount_type, quote.discount_value);

  quote.subtotal = totals.subtotal;
  quote.discount_amount = totals.discount_amount;
  quote.total = totals.total;
  quote.deposit_amount = calculateDeposit(totals.total, quote.deposit_type, quote.deposit_value);

  const expenses = await allAsync(

    `
    SELECT *
    FROM quote_expenses
    WHERE quote_id = ?
    ORDER BY created_at ASC
    `,

    [id]

  );

  quote.expenses = expenses;
  quote.expense_total = round2(expenses.reduce((sum, expense) => sum + expense.amount, 0));
  quote.margin = round2(quote.total - quote.expense_total);

  return quote;

};



// Every read/write here goes through this same "does this quote belong
// to this business" check first, rather than storing business_id
// directly on quote_expenses - mirrors how quote_items has never stored
// its own business_id either, relying entirely on the parent quote for
// tenant scoping.
const getOwnedQuote = (quote_id, business_id) => {

  return getAsync(

    `SELECT id FROM quotes WHERE id = ? AND business_id = ?`,

    [quote_id, business_id]

  );

};


const addQuoteExpense = async (quote_id, business_id, description, amount) => {

  const quote = await getOwnedQuote(quote_id, business_id);

  if (!quote) {
    return null;
  }

  const id = uuidv4();

  await runAsync(

    `
    INSERT INTO quote_expenses (id, quote_id, description, amount)
    VALUES (?, ?, ?, ?)
    `,

    [id, quote_id, description, amount]

  );

  return getAsync(`SELECT * FROM quote_expenses WHERE id = ?`, [id]);

};


const deleteQuoteExpense = async (expense_id, quote_id, business_id) => {

  const quote = await getOwnedQuote(quote_id, business_id);

  if (!quote) {
    return false;
  }

  const result = await runAsync(

    `DELETE FROM quote_expenses WHERE id = ? AND quote_id = ?`,

    [expense_id, quote_id]

  );

  return result.changes > 0;

};



const updateQuoteFields = async (id, business_id, fields) => {

  const existing = await getAsync(

    `SELECT id, sent_at, type FROM quotes WHERE id = ? AND business_id = ?`,

    [id, business_id]

  );

  if (!existing) {
    return false;
  }

  const fieldsWithTimestamps = { ...fields };

  // Converting a quote to an invoice (or vice versa - "Convert to Invoice"
  // is the only path today, but this stays correct either direction) is a
  // new lifecycle stage for reminder purposes: "asking for a decision" and
  // "asking for payment" are different asks with different urgency. Without
  // this reset, quoteReminderService and invoiceReminderService - which both
  // key off these same three columns - would either inherit a reminder_count
  // already at the cap (silently disabling every future reminder on the new
  // document) or an old sent_at already past the reminder cutoff (firing an
  // immediate, premature reminder seconds after the "new" document exists).
  // Reset the whole reminder history so the new type starts its own
  // countdown from scratch, exactly like a freshly-created document would.
  const typeChanged = fieldsWithTimestamps.type !== undefined && fieldsWithTimestamps.type !== existing.type;

  if (typeChanged) {
    fieldsWithTimestamps.sent_at = null;
    fieldsWithTimestamps.last_reminder_sent_at = null;
    fieldsWithTimestamps.reminder_count = 0;
  }

  // First time a quote/invoice transitions to "sent", stamp sent_at - this
  // is what the reminder jobs use to know when the countdown to a first
  // reminder starts. Only set it once; re-saving an already-sent quote
  // must not push the clock forward. Checked against the EFFECTIVE prior
  // sent_at (null if a type change just reset it above), not the stale
  // DB value, so a type-change-plus-resend in the same call correctly
  // re-stamps immediately rather than staying null until some later save.
  const effectiveExistingSentAt = typeChanged ? null : existing.sent_at;

  if (fieldsWithTimestamps.status === "sent" && !effectiveExistingSentAt) {
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
      await runAsync(`DELETE FROM quote_expenses WHERE quote_id = ?`, [id]);

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

  calculateQuoteTotals,

  applyDiscount,

  calculateDeposit,

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

  deleteQuote,

  addQuoteExpense,

  deleteQuoteExpense

};
