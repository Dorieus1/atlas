const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");
const { withTransaction } = require("../../database/transactionQueue");


// A drawn signature is expected to be a modest handful of KB - this cap
// (500,000 base64 characters, ~375KB decoded) is generous for that
// while still refusing an obviously-wrong or abusive payload outright,
// long before it ever reaches a database write. Shared by both
// acceptance paths (the customer's own portal, and a staff member
// capturing a signature in person) so the two can never drift into
// accepting different things.
const MAX_SIGNATURE_LENGTH = 500000;

function validateSignature(signature) {

  if (typeof signature !== "string" || !signature.trim()) {
    return "A signature is required";
  }

  if (!signature.startsWith("data:image/png;base64,")) {
    return "Signature must be a PNG image";
  }

  if (signature.length > MAX_SIGNATURE_LENGTH) {
    return "That signature is too large";
  }

  return null;

}


// Shared by both accept paths (portal + on-site), same reasoning as
// validateSignature above: a "Good/Better/Best" quote can't be accepted
// without saying which package was actually chosen, and a plain quote
// has no tier to choose at all - accepting one of THOSE with an
// (unnecessary) tier_id would be silently ignored rather than rejected,
// since there's nothing wrong with a client that always sends the field.
// `quote` here is expected to already be the result of getQuoteById,
// whose `tiers` array (only ever populated when the quote actually has
// tiers) is exactly what this checks tier_id against.
function validateTierSelection(quote, tier_id) {

  const hasTiers = Array.isArray(quote.tiers) && quote.tiers.length > 0;

  if (!hasTiers) {
    return null;
  }

  if (!tier_id) {
    return "Please choose one of the options before signing";
  }

  if (!quote.tiers.some((tier) => tier.id === tier_id)) {
    return "That option isn't valid for this quote";
  }

  return null;

}


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


// The discount-and-tax math on its own, given a subtotal that's already
// known - used by the list endpoints below, which compute their subtotal
// with a SQL SUM rather than loading every quote's line items into JS.
// calculateQuoteTotals() (below) is the items-array-shaped wrapper around
// this same math, so there is still only one place this logic lives.
// Tax is computed on the DISCOUNTED amount (subtotal minus discount),
// not the raw subtotal - standard invoicing practice, since a discount
// reduces what's actually being sold before tax applies to it.
// tax_rate is optional and defaults to no tax, so every existing
// 3-argument call site (there are several, across analyticsService.js,
// the reminder services, etc.) keeps computing exactly the total it
// always did without needing to be touched.
const applyDiscount = (subtotal, discount_type, discount_value, tax_rate = null) => {

  const discount_amount = calculatePercentOrFixed(subtotal, discount_type, discount_value);
  const taxable_amount = round2(subtotal - discount_amount);
  const tax_amount = tax_rate ? round2(taxable_amount * (Number(tax_rate) / 100)) : 0;
  const total = round2(taxable_amount + tax_amount);

  return { discount_amount, tax_amount, total };

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
// optional discount and tax rate into { subtotal, discount_amount,
// tax_amount, total }. Every place in the app that shows or charges a
// quote's total - the API response, the quotes list, the CSV export,
// the PDF, and the Stripe Checkout Session - has to go through this (or
// applyDiscount() above, when only a pre-summed subtotal is available)
// so a discount or tax rate can never be applied inconsistently between
// two of those places.
const calculateQuoteTotals = (items, discount_type, discount_value, tax_rate = null) => {

  const subtotal = round2(
    (items || []).reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  );

  const { discount_amount, tax_amount, total } = applyDiscount(subtotal, discount_type, discount_value, tax_rate);

  return { subtotal, discount_amount, tax_amount, total };

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



// Inserts one quote_items row, optionally tagged to a tier - shared by
// createQuote and replaceQuoteTiers below so the two never drift on the
// actual INSERT shape.
const insertQuoteItem = (quote_id, item, tier_id = null) => {

  return runAsync(

    `
    INSERT INTO quote_items
    (id, quote_id, description, quantity, unit_price, tier_id)
    VALUES (?, ?, ?, ?, ?, ?)
    `,

    [uuidv4(), quote_id, item.description, item.quantity, item.unit_price, tier_id]

  );

};


// Inserts a quote's tiers (each with its own items) inside an already-
// open transaction - shared by createQuote and replaceQuoteTiers.
const insertQuoteTiers = async (quote_id, tiers) => {

  for (let i = 0; i < tiers.length; i++) {

    const tier = tiers[i];
    const tier_id = uuidv4();

    await runAsync(

      `
      INSERT INTO quote_tiers
      (id, quote_id, name, sort_order, is_recommended)
      VALUES (?, ?, ?, ?, ?)
      `,

      [tier_id, quote_id, tier.name, i, tier.is_recommended ? 1 : 0]

    );

    for (const item of tier.items) {
      await insertQuoteItem(quote_id, item, tier_id);
    }

  }

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
  deposit_value = null,
  tax_rate = null,
  // "Good/Better/Best" multi-option quotes: an array of
  // {name, is_recommended, items}. When present, `items` above means
  // ONLY the items shared across every tier (a common inspection fee,
  // say) - each tier's own items live in tier.items instead. A plain
  // quote (the overwhelming common case) never sets this, and nothing
  // about that path changes.
  tiers = null

) => {

  const id = uuidv4();

  return withTransaction(async () => {

    await runAsync("BEGIN TRANSACTION");

    try {

      // Assigned inside the same serialized transaction as the inserts,
      // not before it. assignNextQuoteNumber's UPDATE ... RETURNING is
      // atomic on its own, but as a bare statement outside the mutex it
      // could land between another concurrent create's BEGIN and COMMIT
      // on the shared connection - and SQLite then fails that COMMIT with
      // "cannot commit transaction - SQL statements in progress". Running
      // it here keeps every quote create's statements strictly ordered.
      const quote_number = await assignNextQuoteNumber(business_id);

      await runAsync(

        `
        INSERT INTO quotes
        (id, business_id, customer_id, type, notes, appointment_id, quote_number, created_by_user_id, created_by_name, discount_type, discount_value, deposit_type, deposit_value, tax_rate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          deposit_value === undefined || deposit_value === null ? null : Number(deposit_value),
          tax_rate === undefined || tax_rate === null ? null : Number(tax_rate)
        ]

      );

      for (const item of items) {
        await insertQuoteItem(id, item, null);
      }

      if (tiers && tiers.length > 0) {
        await insertQuoteTiers(id, tiers);
      }

      await runAsync("COMMIT");

      return { id, quote_number };

    } catch (err) {

      await runAsync("ROLLBACK").catch(() => {});

      throw err;

    }

  });

};



// Atomic compare-and-swap for the one-time "mark this paid" transition -
// added after a review pass caught that quotePaymentService.js's
// markQuotePaid was a plain read-then-write with no lock around it: two
// overlapping Stripe webhook deliveries for the same checkout session
// (Stripe does retry on timeout) could both read status !== 'paid'
// before either had committed its write, and both would then fire the
// review-request email. A single UPDATE...WHERE is atomic on its own -
// SQLite guarantees no other statement can observe or interleave with
// it mid-flight - so gating on `this.changes > 0` tells the caller
// whether ITS call was the one that actually made the transition,
// without needing an explicit transaction at all.
const markQuotePaidAtomic = (quote_id, business_id, paid_at) => {

  return new Promise((resolve, reject) => {

    db.run(

      `
      UPDATE quotes
      SET status = 'paid', paid_at = ?
      WHERE id = ?
      AND business_id = ?
      AND status != 'paid'
      `,

      [paid_at, quote_id, business_id],

      function (err) {
        if (err) reject(err); else resolve(this.changes > 0);
      }

    );

  });

};



// Same compare-and-swap shape as markQuotePaidAtomic above, for the
// deposit-paid transition.
const markQuoteDepositPaidAtomic = (quote_id, business_id, deposit_paid_at) => {

  return new Promise((resolve, reject) => {

    db.run(

      `
      UPDATE quotes
      SET deposit_paid_at = ?
      WHERE id = ?
      AND business_id = ?
      AND deposit_paid_at IS NULL
      `,

      [deposit_paid_at, quote_id, business_id],

      function (err) {
        if (err) reject(err); else resolve(this.changes > 0);
      }

    );

  });

};



// Same compare-and-swap shape as markQuotePaidAtomic above, for the
// "sign/accept" transition shared by portalController.js's acceptQuote
// (the customer's own portal, remote) and quoteController.js's
// signQuoteInPerson (a staff member's device, on-site). A peer review
// caught that both of those were doing the same read-check-then-write
// this exact codebase had already fixed twice elsewhere the same day
// (the Stripe webhook idempotency fix and the appointment-completion
// duplicate-invoice fix, both in e297073) - fetching the quote,
// checking status === 'sent', THEN calling the generic updateQuoteFields
// above, whose own UPDATE has no status guard in its WHERE clause at
// all. Two near-simultaneous signing attempts (an ordinary double-tap
// on a slow connection, no malicious intent needed) could both pass the
// pre-check before either write landed, and the second write would
// silently clobber the first's signature/name/method with no error to
// either side - exactly wrong for a feature whose entire point is being
// a reliable "who signed and how" record. Deliberately NOT folded into
// updateQuoteFields itself (unlike this function, that one is a
// general-purpose multi-field updater used by callers with entirely
// different prior-status expectations - hard-coding "WHERE status =
// 'sent'" there would break every one of them); this is its own
// narrowly-scoped atomic write instead, exactly like markQuotePaidAtomic.
// accepted_tier_id is null for a plain (non-tiered) quote, exactly as
// before this feature existed - only a "Good/Better/Best" quote's accept
// flow ever passes a real one, and the controller validates it actually
// belongs to this quote's own tiers before this atomic write ever runs.
// signed_ip_address/signed_user_agent are the audit trail (migration
// 057) - whichever request actually carried the signature, recorded
// unconditionally rather than left null when missing, since "unknown"
// is itself worth recording accurately rather than silently.
const acceptQuoteWithSignatureAtomic = (id, business_id, { accepted_by_name, signature, signature_method, accepted_tier_id = null, signed_ip_address = null, signed_user_agent = null }) => {

  return new Promise((resolve, reject) => {

    db.run(

      `
      UPDATE quotes
      SET status = 'accepted',
          accepted_at = ?,
          accepted_by_name = ?,
          signature = ?,
          signature_method = ?,
          accepted_tier_id = ?,
          signed_ip_address = ?,
          signed_user_agent = ?
      WHERE id = ?
      AND business_id = ?
      AND status = 'sent'
      `,

      [new Date().toISOString(), accepted_by_name, signature, signature_method, accepted_tier_id, signed_ip_address, signed_user_agent, id, business_id],

      function (err) {
        if (err) reject(err); else resolve(this.changes > 0);
      }

    );

  });

};



// Powers the accept flow's own validation: is this tier_id actually one
// of THIS quote's tiers, not some other quote's (or made up)? Kept
// separate from getQuoteById's full breakdown since the accept
// controllers only need this one cheap check, not every tier's totals.
const getQuoteTierIds = async (quote_id) => {

  const rows = await allAsync(

    `SELECT id FROM quote_tiers WHERE quote_id = ?`,

    [quote_id]

  );

  return rows.map((row) => row.id);

};



const getQuoteByAppointmentId = (appointment_id, business_id) => {

  return getAsync(

    `
    SELECT id, status, type,
      EXISTS(SELECT 1 FROM quote_tiers WHERE quote_tiers.quote_id = quotes.id) AS has_tiers
    FROM quotes
    WHERE appointment_id = ?
    AND business_id = ?
    `,

    [appointment_id, business_id]

  );

};



// A tiered quote's "headline" subtotal - the ONE number every list view,
// the CSV export, and analytics need, exactly like a plain quote's
// subtotal always was. Shared items (tier_id IS NULL) always count.
// Tier-specific items only count for the "resolved" tier: whichever tier
// was actually accepted, or - before acceptance - whichever tier the
// owner marked recommended, or the first tier if none is, matching the
// same resolution getQuoteById below uses to pick a headline total.
// A quote with zero tiers has every item's tier_id NULL, so this
// collapses back to exactly the old "sum every item" behavior - nothing
// changes for the overwhelming common case.
const RESOLVED_TIER_ID_SQL = `(
  SELECT quote_tiers.id FROM quote_tiers
  WHERE quote_tiers.quote_id = quotes.id
  ORDER BY quote_tiers.is_recommended DESC, quote_tiers.sort_order ASC
  LIMIT 1
)`;

const EFFECTIVE_SUBTOTAL_SQL = `
  COALESCE(SUM(
    CASE
      WHEN quote_items.tier_id IS NULL THEN quote_items.quantity * quote_items.unit_price
      WHEN quote_items.tier_id = COALESCE(quotes.accepted_tier_id, ${RESOLVED_TIER_ID_SQL}) THEN quote_items.quantity * quote_items.unit_price
      ELSE 0
    END
  ), 0)
`;



const getQuotes = async (business_id) => {

  const rows = await allAsync(

    `
    SELECT
      quotes.*,
      customers.name AS customer_name,
      ${EFFECTIVE_SUBTOTAL_SQL} AS subtotal
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
    const { discount_amount, tax_amount, total } = applyDiscount(subtotal, row.discount_type, row.discount_value, row.tax_rate);
    const deposit_amount = calculateDeposit(total, row.deposit_type, row.deposit_value);

    return { ...row, subtotal, discount_amount, tax_amount, total, deposit_amount };

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
      ${EFFECTIVE_SUBTOTAL_SQL} AS subtotal
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
    const { discount_amount, tax_amount, total } = applyDiscount(subtotal, row.discount_type, row.discount_value, row.tax_rate);
    const deposit_amount = calculateDeposit(total, row.deposit_type, row.deposit_value);

    return { ...row, subtotal, discount_amount, tax_amount, total, deposit_amount };

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



const getQuoteExpensesForQuoteIds = async (quoteIds) => {

  if (quoteIds.length === 0) {
    return [];
  }

  const placeholders = quoteIds.map(() => "?").join(", ");

  return allAsync(

    `
    SELECT *
    FROM quote_expenses
    WHERE quote_id IN (${placeholders})
    ORDER BY created_at ASC
    `,

    quoteIds

  );

};



// Same bulk-fetch shape as getQuoteExpensesForQuoteIds above, for manual
// payments (cash/check/etc.) - powers AR aging's own amount_paid math,
// which needs every outstanding invoice's payments at once rather than
// one query per invoice.
const getQuotePaymentsForQuoteIds = async (quoteIds) => {

  if (quoteIds.length === 0) {
    return [];
  }

  const placeholders = quoteIds.map(() => "?").join(", ");

  return allAsync(

    `
    SELECT *
    FROM quote_payments
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
      ${EFFECTIVE_SUBTOTAL_SQL} AS subtotal
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
    const { discount_amount, tax_amount, total } = applyDiscount(subtotal, row.discount_type, row.discount_value, row.tax_rate);
    const deposit_amount = calculateDeposit(total, row.deposit_type, row.deposit_value);

    return { ...row, subtotal, discount_amount, tax_amount, total, deposit_amount };

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

  const tierRows = await allAsync(

    `
    SELECT *
    FROM quote_tiers
    WHERE quote_id = ?
    ORDER BY sort_order ASC
    `,

    [id]

  );

  // Every existing consumer of quote.items (the flat item list, the
  // owner's quote builder reconstructing what's stored, etc.) still gets
  // ALL items exactly as before - tier-tagged or not. Tier-aware
  // consumers use quote.tiers/quote.shared_items instead.
  quote.items = items;

  const sharedItems = items.filter((item) => !item.tier_id);

  // Which items actually determine the ONE headline subtotal/total this
  // function has always returned (used by the PDF total, Stripe
  // Checkout, analytics, the list views' own SQL equivalent above,
  // etc.): the accepted tier's items once a customer has picked one,
  // otherwise the tier the owner marked recommended, otherwise simply
  // the first tier - resolved the same way EFFECTIVE_SUBTOTAL_SQL
  // resolves it for the list endpoints, so a single quote's GET and its
  // row in the list always agree. A quote with no tiers at all has
  // every item already in sharedItems, so effectiveItems is just "every
  // item" - identical to this function's behavior before tiers existed.
  let effectiveItems = items;

  if (tierRows.length > 0) {

    const resolvedTier =
      tierRows.find((tier) => tier.id === quote.accepted_tier_id) ||
      tierRows.find((tier) => tier.is_recommended) ||
      tierRows[0];

    quote.resolved_tier_id = resolvedTier.id;

    effectiveItems = [...sharedItems, ...items.filter((item) => item.tier_id === resolvedTier.id)];

    quote.shared_items = sharedItems;

    // The full side-by-side comparison the customer (or the owner,
    // previewing) actually sees before a decision is made - each tier
    // with only ITS OWN items plus its own computed totals (shared
    // items' cost is folded into every tier's total below, but not
    // repeated in tier.items, since the UI renders the shared list once
    // and each tier's own list separately).
    quote.tiers = tierRows.map((tier) => {

      const tierItems = items.filter((item) => item.tier_id === tier.id);
      const combinedItems = [...sharedItems, ...tierItems];

      const tierTotals = calculateQuoteTotals(combinedItems, quote.discount_type, quote.discount_value, quote.tax_rate);

      return {
        id: tier.id,
        name: tier.name,
        sort_order: tier.sort_order,
        is_recommended: !!tier.is_recommended,
        items: tierItems,
        subtotal: tierTotals.subtotal,
        discount_amount: tierTotals.discount_amount,
        tax_amount: tierTotals.tax_amount,
        total: tierTotals.total,
        deposit_amount: calculateDeposit(tierTotals.total, quote.deposit_type, quote.deposit_value)
      };

    });

  }

  const totals = calculateQuoteTotals(effectiveItems, quote.discount_type, quote.discount_value, quote.tax_rate);

  quote.subtotal = totals.subtotal;
  quote.discount_amount = totals.discount_amount;
  quote.tax_amount = totals.tax_amount;
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

  const payments = await allAsync(

    `
    SELECT *
    FROM quote_payments
    WHERE quote_id = ?
    ORDER BY created_at ASC
    `,

    [id]

  );

  quote.payments = payments;

  // Combines both ways money can already be marked received against
  // this quote - a Stripe deposit (deposit_amount/deposit_paid_at,
  // untouched by this feature) and any manually-recorded payments
  // (cash, check, etc. - see addQuotePayment below) - into the one
  // number that actually matters to the owner: how much is left. Manual
  // payments are validated at insert time to never push amount_paid
  // past total (see addQuotePayment), so balance_due should never go
  // negative in practice, but it's still floored at 0 for display in
  // case a deposit and manual payments are recorded in an order that
  // would otherwise show a confusing negative balance.
  const manualPaymentsTotal = round2(payments.reduce((sum, payment) => sum + payment.amount, 0));
  const depositCollected = quote.deposit_paid_at ? quote.deposit_amount : 0;

  quote.amount_paid = round2(depositCollected + manualPaymentsTotal);
  quote.balance_due = Math.max(0, round2(quote.total - quote.amount_paid));

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



// A payment collected outside Stripe - cash, check, Venmo, etc. - logged
// against an invoice. Deliberately no business-rule validation here
// (amount sanity, status checks, whether this would overpay) - that
// lives in the controller, same separation already used for discount/
// deposit/tax validation elsewhere in this file's callers.
const addQuotePayment = async (quote_id, business_id, amount, method, note, created_by_user_id, created_by_name) => {

  const quote = await getOwnedQuote(quote_id, business_id);

  if (!quote) {
    return null;
  }

  const id = uuidv4();

  await runAsync(

    `
    INSERT INTO quote_payments (id, quote_id, amount, method, note, created_by_user_id, created_by_name)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,

    [id, quote_id, amount, method || "other", note || null, created_by_user_id || null, created_by_name || null]

  );

  return getAsync(`SELECT * FROM quote_payments WHERE id = ?`, [id]);

};


const deleteQuotePayment = async (payment_id, quote_id, business_id) => {

  const quote = await getOwnedQuote(quote_id, business_id);

  if (!quote) {
    return false;
  }

  const result = await runAsync(

    `DELETE FROM quote_payments WHERE id = ? AND quote_id = ?`,

    [payment_id, quote_id]

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



// Like replaceQuoteItems below, but for a "Good/Better/Best" quote: full
// replace of both the shared items AND every tier (and each tier's own
// items) in one go, exactly like a form re-save. Only ever called by the
// controller when the request actually includes a `tiers` array - a
// plain quote's edit flow keeps using replaceQuoteItems untouched, so
// this never runs for the overwhelming common case. accepted_tier_id is
// reset to NULL here: once the tiers themselves are being redefined, an
// old acceptance's tier choice may no longer even exist, and re-deciding
// what "the accepted tier" means for an already-signed quote is a
// judgment call for a human, not something to guess at silently.
const replaceQuoteTiers = async (id, business_id, sharedItems, tiers) => {

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
      await runAsync(`DELETE FROM quote_tiers WHERE quote_id = ?`, [id]);

      await runAsync(`UPDATE quotes SET accepted_tier_id = NULL WHERE id = ?`, [id]);

      for (const item of sharedItems) {
        await insertQuoteItem(id, item, null);
      }

      await insertQuoteTiers(id, tiers);

      await runAsync("COMMIT");

      return true;

    } catch (err) {

      await runAsync("ROLLBACK").catch(() => {});

      throw err;

    }

  });

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



// A real bug review caught a genuine cross-tenant hole here: the three
// child deletes below used to run unscoped by business_id, on the
// (wrong) assumption that the final `DELETE FROM quotes ... AND
// business_id = ?` guarded the whole operation. It didn't - anyone who
// knew (or guessed) another business's quote id could wipe that
// quote's line items, logged expenses, and recorded payments even
// though the parent row survived untouched (the parent delete matches
// 0 rows and the API correctly reports 404, giving no visible sign
// anything happened). The ownership check now happens FIRST, exactly
// like every other quote-child mutation in this file already does via
// getOwnedQuote (addQuoteExpense, deleteQuoteExpense, addQuotePayment,
// deleteQuotePayment, replaceQuoteItems) - this was the one function
// in the file that skipped it.
const deleteQuote = async (id, business_id) => {

  const quote = await getOwnedQuote(id, business_id);

  if (!quote) {
    return false;
  }

  return withTransaction(async () => {

    await runAsync("BEGIN TRANSACTION");

    try {

      await runAsync(`DELETE FROM quote_items WHERE quote_id = ?`, [id]);
      await runAsync(`DELETE FROM quote_expenses WHERE quote_id = ?`, [id]);
      await runAsync(`DELETE FROM quote_payments WHERE quote_id = ?`, [id]);

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

  markQuotePaidAtomic,

  markQuoteDepositPaidAtomic,

  validateSignature,

  validateTierSelection,

  acceptQuoteWithSignatureAtomic,

  getQuotes,

  getQuotesForExport,

  getQuoteItemsForQuoteIds,

  getQuoteExpensesForQuoteIds,

  getQuotePaymentsForQuoteIds,

  getQuotesByCustomer,

  getQuoteById,

  updateQuoteFields,

  replaceQuoteItems,

  replaceQuoteTiers,

  getQuoteTierIds,

  deleteQuote,

  addQuoteExpense,

  deleteQuoteExpense,

  addQuotePayment,

  deleteQuotePayment,

  EFFECTIVE_SUBTOTAL_SQL

};
