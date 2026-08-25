const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");


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



const createQuote = async (

  business_id,
  customer_id,
  type,
  notes,
  items,
  appointment_id = null

) => {

  const id = uuidv4();

  await runAsync("BEGIN TRANSACTION");

  try {

    await runAsync(

      `
      INSERT INTO quotes
      (id, business_id, customer_id, type, notes, appointment_id)
      VALUES (?, ?, ?, ?, ?, ?)
      `,

      [id, business_id, customer_id, type, notes || null, appointment_id]

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

    return id;

  } catch (err) {

    await runAsync("ROLLBACK").catch(() => {});

    throw err;

  }

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

    `SELECT id FROM quotes WHERE id = ? AND business_id = ?`,

    [id, business_id]

  );

  if (!existing) {
    return false;
  }

  const setClauses = [];
  const values = [];

  for (const [key, value] of Object.entries(fields)) {
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

};



const deleteQuote = async (id, business_id) => {

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

};



module.exports = {

  createQuote,

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
