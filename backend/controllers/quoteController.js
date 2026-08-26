const {
  createQuote: createQuoteService,
  calculateQuoteTotals,
  applyDiscount,
  formatQuoteNumber,
  getQuotes: getQuotesService,
  getQuotesForExport: getQuotesForExportService,
  getQuoteItemsForQuoteIds: getQuoteItemsForQuoteIdsService,
  getQuoteExpensesForQuoteIds: getQuoteExpensesForQuoteIdsService,
  getQuotesByCustomer: getQuotesByCustomerService,
  getQuoteById: getQuoteByIdService,
  updateQuoteFields: updateQuoteFieldsService,
  replaceQuoteItems: replaceQuoteItemsService,
  deleteQuote: deleteQuoteService,
  addQuoteExpense: addQuoteExpenseService,
  deleteQuoteExpense: deleteQuoteExpenseService,
  addQuotePayment: addQuotePaymentService,
  deleteQuotePayment: deleteQuotePaymentService
} = require("../services/quoteService");

const { getCustomerById } = require("../services/customerService");
const { getBusinessById } = require("../services/businessService");
const { getUserById } = require("../services/authService");
const { markQuotePaid } = require("../services/quotePaymentService");
const { streamQuotePdf } = require("../services/pdfService");
const { quotesToCsv } = require("../services/csvService");
const { createLoginToken } = require("../services/portalAuthService");
const { sendEmail } = require("../services/emailService");


const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// A week gives a customer real time to notice the email, unlike the
// 15-minute window used for a customer-initiated "log me in right now"
// link (backend/controllers/portalController.js's requestLogin).
const QUOTE_EMAIL_LINK_TTL_MINUTES = 7 * 24 * 60;

// Resend (and most transactional email providers) refuses to send to
// arbitrary real addresses from an unverified/shared sending domain
// (Atlas's default "onboarding@resend.dev") until the business verifies
// its own domain - a one-time setup step, not a bug. Detected by
// message text since Resend doesn't expose a stable error code for
// this in its response body; falls back to the generic message for any
// other failure (a real network error, an expired API key, etc.) so
// this never MISreports an unrelated problem as a domain-verification
// issue.
function isEmailSendingNotConfiguredError(error) {

  const message = (error?.message || "").toLowerCase();

  return message.includes("testing email address") || message.includes("verify a domain");

}

function formatMoneyForEmail(amount) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount || 0);
}


const VALID_TYPES = ["quote", "invoice"];
const VALID_STATUSES = ["draft", "sent", "accepted", "declined", "paid"];
const VALID_PAYMENT_METHODS = ["cash", "check", "bank_transfer", "other"];


function validateItems(items) {

  if (!Array.isArray(items) || items.length === 0) {
    return "At least one line item is required";
  }

  if (items.length > 100) {
    return "Too many line items";
  }

  for (const item of items) {

    if (!item.description || !String(item.description).trim()) {
      return "Every line item needs a description";
    }

    if (String(item.description).length > 300) {
      return "A line item description is too long";
    }

    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unit_price);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return "Every line item needs a positive quantity";
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return "Every line item needs a valid unit price";
    }

  }

  return null;

}


function normalizeItems(items) {

  return items.map((item) => ({
    description: String(item.description).trim(),
    quantity: Number(item.quantity),
    unit_price: Number(item.unit_price)
  }));

}


// Validates a discount_type/discount_value pair against a subtotal that's
// already known (the caller computes it from whatever line items will be
// in effect - the new ones on a create/replace, or the existing ones on
// an update that doesn't touch items). Returns an error string, or null
// if the pair is fine.
//
// Both fields must be omitted/null together (no discount) or both
// present - a type with no value (or vice versa) is a malformed request,
// not something to silently coerce. A fixed discount that would exceed
// the subtotal is rejected outright rather than clamped to it: clamping
// would silently change what the business owner asked for into something
// they didn't, for a feature that's directly about money.
function validateDiscount(discount_type, discount_value, subtotal) {

  const hasType = discount_type !== undefined && discount_type !== null && discount_type !== "";
  const hasValue = discount_value !== undefined && discount_value !== null;

  if (!hasType && !hasValue) {
    return null;
  }

  if (hasType !== hasValue) {
    return "discount_type and discount_value must both be provided, or both left out";
  }

  if (!["percent", "fixed"].includes(discount_type)) {
    return "discount_type must be 'percent' or 'fixed'";
  }

  const value = Number(discount_value);

  if (!Number.isFinite(value) || value < 0) {
    return "discount_value must be a non-negative number";
  }

  if (discount_type === "percent" && value > 100) {
    return "A percent discount can't be more than 100%";
  }

  if (discount_type === "fixed" && value > subtotal) {
    return "A fixed discount can't be more than the subtotal";
  }

  return null;

}


// Simpler than validateDiscount/validateDeposit - tax is always a
// percentage, never a fixed dollar amount, so there's no type field to
// check. null/undefined (no override - use the business's own default)
// is valid; anything else must be a real, sane percentage.
function validateTaxRate(tax_rate) {

  if (tax_rate === undefined || tax_rate === null || tax_rate === "") {
    return null;
  }

  const value = Number(tax_rate);

  if (!Number.isFinite(value) || value < 0) {
    return "tax_rate must be a non-negative number";
  }

  if (value > 100) {
    return "tax_rate can't be more than 100%";
  }

  return null;

}



// Same both-or-neither shape as validateDiscount above, but checked
// against the quote's TOTAL (after any discount is applied) rather than
// its subtotal - a deposit is up-front money toward what the customer
// will actually owe, so it can never exceed that. The caller computes
// that total from whatever items/discount will be in effect once this
// request lands, same reasoning as validateDiscount's subtotal argument.
function validateDeposit(deposit_type, deposit_value, total) {

  const hasType = deposit_type !== undefined && deposit_type !== null && deposit_type !== "";
  const hasValue = deposit_value !== undefined && deposit_value !== null;

  if (!hasType && !hasValue) {
    return null;
  }

  if (hasType !== hasValue) {
    return "deposit_type and deposit_value must both be provided, or both left out";
  }

  if (!["percent", "fixed"].includes(deposit_type)) {
    return "deposit_type must be 'percent' or 'fixed'";
  }

  const value = Number(deposit_value);

  if (!Number.isFinite(value) || value < 0) {
    return "deposit_value must be a non-negative number";
  }

  if (deposit_type === "percent" && value > 100) {
    return "A percent deposit can't be more than 100%";
  }

  if (deposit_type === "fixed" && value > total) {
    return "A fixed deposit can't be more than the quote's total";
  }

  return null;

}


// Attaches the formatted "Q-1001"/"INV-1002" display number to a quote
// row (or every row in an array) before it goes out in a response.
function withFormattedNumber(quoteOrQuotes) {

  if (Array.isArray(quoteOrQuotes)) {
    return quoteOrQuotes.map(withFormattedNumber);
  }

  if (!quoteOrQuotes) {
    return quoteOrQuotes;
  }

  return {
    ...quoteOrQuotes,
    quote_number_formatted: formatQuoteNumber(quoteOrQuotes.type, quoteOrQuotes.quote_number)
  };

}



const createQuote = async (req, res) => {

  try {

    const {
      customer_id,
      type,
      notes,
      items,
      discount_type,
      discount_value,
      deposit_type,
      deposit_value,
      tax_rate
    } = req.body;

    const business_id = req.user.business_id;

    if (!customer_id) {

      return res.status(400).json({
        error: "customer_id is required"
      });

    }

    const quoteType = type || "quote";

    if (!VALID_TYPES.includes(quoteType)) {

      return res.status(400).json({
        error: "type must be one of: " + VALID_TYPES.join(", ")
      });

    }

    const itemsError = validateItems(items);

    if (itemsError) {

      return res.status(400).json({
        error: itemsError
      });

    }

    const normalizedItems = normalizeItems(items);

    const { subtotal } = calculateQuoteTotals(normalizedItems, null, null);

    const discountError = validateDiscount(discount_type, discount_value, subtotal);

    if (discountError) {

      return res.status(400).json({
        error: discountError
      });

    }

    const taxRateError = validateTaxRate(tax_rate);

    if (taxRateError) {

      return res.status(400).json({
        error: taxRateError
      });

    }

    const [customer, business] = await Promise.all([
      getCustomerById(customer_id, business_id),
      getBusinessById(business_id)
    ]);

    if (!customer) {

      return res.status(404).json({
        error: "Customer not found"
      });

    }

    // An explicit tax_rate on the request - including 0, a deliberate
    // "no tax on this one" override - wins outright; omitting it entirely
    // falls back to whatever the business has configured as their
    // default in Settings, so an owner doesn't have to remember to type
    // their rate in on every single quote.
    const effectiveTaxRate = tax_rate === undefined || tax_rate === null || tax_rate === ""
      ? (business?.default_tax_rate ?? null)
      : Number(tax_rate);

    // The deposit is checked against the total, which needs the discount
    // and tax factored in first - applyDiscount() rather than a second
    // call to calculateQuoteTotals() since the items are already summed
    // above.
    const { total } = applyDiscount(
      subtotal,
      discount_type || null,
      discount_value === undefined ? null : discount_value,
      effectiveTaxRate
    );

    const depositError = validateDeposit(deposit_type, deposit_value, total);

    if (depositError) {

      return res.status(400).json({
        error: depositError
      });

    }

    // Snapshot the acting user's current name at creation time - see the
    // matching comment in customerController.createCustomer for why this
    // isn't a live join to `users`.
    const actingUser = await getUserById(req.user.id, business_id);

    const { id, quote_number } = await createQuoteService(
      business_id,
      customer_id,
      quoteType,
      notes,
      normalizedItems,
      null,
      req.user.id,
      actingUser ? actingUser.name : null,
      discount_type || null,
      discount_value === undefined ? null : discount_value,
      deposit_type || null,
      deposit_value === undefined ? null : deposit_value,
      effectiveTaxRate
    );

    res.status(201).json({
      id,
      quote_number,
      quote_number_formatted: formatQuoteNumber(quoteType, quote_number),
      message: quoteType === "invoice" ? "Invoice created" : "Quote created"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const getQuotes = async (req, res) => {

  try {

    const quotes = await getQuotesService(req.user.business_id);

    res.json(withFormattedNumber(quotes));

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const exportQuotesCsv = async (req, res) => {

  try {

    const business_id = req.user.business_id;
    const { type, status } = req.query;

    if (type !== undefined && !VALID_TYPES.includes(type)) {

      return res.status(400).json({
        error: "type must be one of: " + VALID_TYPES.join(", ")
      });

    }

    if (status !== undefined && !VALID_STATUSES.includes(status)) {

      return res.status(400).json({
        error: "status must be one of: " + VALID_STATUSES.join(", ")
      });

    }

    const quotes = await getQuotesForExportService(business_id, { type, status });

    const quoteIds = quotes.map((quote) => quote.id);

    const [items, expenses] = await Promise.all([
      getQuoteItemsForQuoteIdsService(quoteIds),
      getQuoteExpensesForQuoteIdsService(quoteIds)
    ]);

    const itemsByQuoteId = {};

    for (const item of items) {

      if (!itemsByQuoteId[item.quote_id]) {
        itemsByQuoteId[item.quote_id] = [];
      }

      itemsByQuoteId[item.quote_id].push(item);

    }

    const expensesByQuoteId = {};

    for (const expense of expenses) {

      if (!expensesByQuoteId[expense.quote_id]) {
        expensesByQuoteId[expense.quote_id] = [];
      }

      expensesByQuoteId[expense.quote_id].push(expense);

    }

    const csv = quotesToCsv(quotes, itemsByQuoteId, expensesByQuoteId);

    const business = await getBusinessById(business_id);

    // Business name folded into a filesystem/header-safe slug - avoids
    // quotes, slashes, or other characters that would need escaping (or
    // could break) inside a Content-Disposition filename value.
    const businessSlug = (business?.name || "atlas")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "atlas";

    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `${businessSlug}-quotes-${dateStamp}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    res.send(csv);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const getCustomerQuotes = async (req, res) => {

  try {

    const { customer_id } = req.params;
    const business_id = req.user.business_id;

    const customer = await getCustomerById(customer_id, business_id);

    if (!customer) {

      return res.status(404).json({
        error: "Customer not found"
      });

    }

    const quotes = await getQuotesByCustomerService(customer_id, business_id);

    res.json(withFormattedNumber(quotes));

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const getQuote = async (req, res) => {

  try {

    const quote = await getQuoteByIdService(req.params.id, req.user.business_id);

    if (!quote) {

      return res.status(404).json({
        error: "Not found"
      });

    }

    res.json(withFormattedNumber(quote));

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const sendQuote = async (req, res) => {

  try {

    const { id } = req.params;
    const business_id = req.user.business_id;

    const quote = await getQuoteByIdService(id, business_id);

    if (!quote) {

      return res.status(404).json({
        error: "Not found"
      });

    }

    const customer = await getCustomerById(quote.customer_id, business_id);

    if (!customer || !customer.email) {

      return res.status(400).json({
        error: "This customer doesn't have an email on file."
      });

    }

    const business = await getBusinessById(business_id);

    const token = await createLoginToken(customer.id, business_id, QUOTE_EMAIL_LINK_TTL_MINUTES);
    const portalUrl = `${FRONTEND_URL}/portal/${business.slug}?token=${token}`;

    const label = quote.type === "invoice" ? "invoice" : "quote";

    // Sent before the status flips to "sent" - if this throws, the quote
    // must stay whatever it was, not get marked as delivered when the
    // customer was never actually notified.
    await sendEmail({

      to: customer.email,

      subject: `Your ${label} from ${business.name} — ${formatMoneyForEmail(quote.total)}`,

      html: `
        <p>Hi ${customer.name || "there"},</p>
        <p>${business.name} has sent you a${label === "invoice" ? "n" : ""} ${label} for ${formatMoneyForEmail(quote.total)}.</p>
        ${quote.deposit_type && !quote.deposit_paid_at ? `<p>A deposit of ${formatMoneyForEmail(quote.deposit_amount)} is required to get started.</p>` : ""}
        <p><a href="${portalUrl}">View and respond to it here</a></p>
        <p>This link works for the next 7 days. If you didn't expect this, you can ignore this email.</p>
      `

    });

    // Only advances draft -> sent - re-sending an already-accepted/paid
    // quote (e.g. because the customer lost the email) shouldn't roll its
    // status backward.
    if (quote.status === "draft") {
      await updateQuoteFieldsService(id, business_id, { status: "sent" });
    }

    res.json({
      message: "Sent"
    });

  } catch (error) {

    console.error("SEND QUOTE ERROR:", error);

    if (isEmailSendingNotConfiguredError(error)) {

      return res.status(500).json({
        error: "Emails can't be sent to real customers yet - your email service needs a verified sending domain first. This is a one-time setup, not a bug with this quote."
      });

    }

    res.status(500).json({
      error: "Couldn't send this to the customer. Please try again."
    });

  }

};



const addQuoteExpense = async (req, res) => {

  try {

    const { id } = req.params;
    const business_id = req.user.business_id;
    const { description, amount } = req.body;

    if (!description || !description.trim()) {

      return res.status(400).json({
        error: "A description is required"
      });

    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount < 0) {

      return res.status(400).json({
        error: "Enter a valid, non-negative amount"
      });

    }

    const expense = await addQuoteExpenseService(id, business_id, description.trim(), numericAmount);

    if (!expense) {

      return res.status(404).json({
        error: "Not found"
      });

    }

    res.status(201).json(expense);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const deleteQuoteExpense = async (req, res) => {

  try {

    const { id, expenseId } = req.params;
    const business_id = req.user.business_id;

    const deleted = await deleteQuoteExpenseService(expenseId, id, business_id);

    if (!deleted) {

      return res.status(404).json({
        error: "Not found"
      });

    }

    res.json({
      message: "Deleted"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



// Records a payment collected outside Stripe (cash, check, bank
// transfer) against an invoice. Deliberately narrower than the Stripe/
// deposit flow it sits alongside: only ever adds toward the balance,
// never exceeds it, and only while the invoice is actually awaiting
// payment - an owner fixing a mistake after the fact isn't what this is
// for (see deleteQuotePayment's own status check for the same reason).
const addQuotePayment = async (req, res) => {

  try {

    const { id } = req.params;
    const business_id = req.user.business_id;
    const { amount, method, note } = req.body;

    const quote = await getQuoteByIdService(id, business_id);

    if (!quote) {

      return res.status(404).json({
        error: "Not found"
      });

    }

    if (quote.type !== "invoice") {

      return res.status(400).json({
        error: "Only invoices can have payments recorded against them"
      });

    }

    if (quote.status !== "sent" && quote.status !== "accepted") {

      return res.status(400).json({
        error: quote.status === "paid"
          ? "This invoice is already fully paid"
          : "This invoice isn't ready to record payments against yet"
      });

    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {

      return res.status(400).json({
        error: "Enter a valid, positive amount"
      });

    }

    // A small epsilon absorbs float rounding (e.g. a balance_due of
    // 476.28000000000003) without ever letting a payment meaningfully
    // overshoot what's actually still owed.
    if (numericAmount > quote.balance_due + 0.01) {

      return res.status(400).json({
        error: `That's more than the remaining balance of $${quote.balance_due.toFixed(2)}`
      });

    }

    const paymentMethod = method || "other";

    if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {

      return res.status(400).json({
        error: "method must be one of: " + VALID_PAYMENT_METHODS.join(", ")
      });

    }

    const actingUser = await getUserById(req.user.id, business_id);

    const payment = await addQuotePaymentService(
      id,
      business_id,
      numericAmount,
      paymentMethod,
      note ? String(note).trim().slice(0, 500) : null,
      req.user.id,
      actingUser ? actingUser.name : null
    );

    // Reusing markQuotePaid rather than flipping status here directly -
    // it already carries the review-request automation and the
    // idempotency guarantee every other path to "paid" goes through
    // (see quotePaymentService.js), so a customer who happens to fully
    // pay via a manually-recorded payment gets exactly the same
    // follow-up as one who paid through Stripe.
    let markedPaid = false;

    if (numericAmount >= quote.balance_due - 0.01) {

      const result = await markQuotePaid(id, business_id);
      markedPaid = result.found && !result.alreadyPaid;

    }

    res.status(201).json({ ...payment, markedPaid });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const deleteQuotePayment = async (req, res) => {

  try {

    const { id, paymentId } = req.params;
    const business_id = req.user.business_id;

    const quote = await getQuoteByIdService(id, business_id);

    if (!quote) {

      return res.status(404).json({
        error: "Not found"
      });

    }

    // Once the invoice is actually marked paid, removing a payment that
    // helped get it there would leave it in an inconsistent state (paid,
    // but visibly underpaid) - same reasoning as the items/discount/tax
    // edit lock elsewhere in this file.
    if (quote.status === "paid") {

      return res.status(400).json({
        error: "This has already been paid in full and its payments can't be edited."
      });

    }

    const deleted = await deleteQuotePaymentService(paymentId, id, business_id);

    if (!deleted) {

      return res.status(404).json({
        error: "Not found"
      });

    }

    res.json({
      message: "Deleted"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const updateQuote = async (req, res) => {

  try {

    const { id } = req.params;
    const business_id = req.user.business_id;
    const { status, notes, type, items, discount_type, discount_value, deposit_type, deposit_value, tax_rate } = req.body;

    if (status !== undefined && !VALID_STATUSES.includes(status)) {

      return res.status(400).json({
        error: "status must be one of: " + VALID_STATUSES.join(", ")
      });

    }

    if (type !== undefined && !VALID_TYPES.includes(type)) {

      return res.status(400).json({
        error: "type must be one of: " + VALID_TYPES.join(", ")
      });

    }

    if (items !== undefined) {

      const itemsError = validateItems(items);

      if (itemsError) {

        return res.status(400).json({
          error: itemsError
        });

      }

    }

    // Whether discount_type/discount_value, or deposit_type/deposit_value,
    // are being changed in this request at all - if a pair is absent, the
    // stored value (if any) is left exactly as-is.
    const discountFieldsProvided = discount_type !== undefined || discount_value !== undefined;
    const depositFieldsProvided = deposit_type !== undefined || deposit_value !== undefined;
    const taxRateProvided = tax_rate !== undefined;

    if (taxRateProvided) {

      const taxRateError = validateTaxRate(tax_rate);

      if (taxRateError) {

        return res.status(400).json({
          error: taxRateError
        });

      }

    }

    // A discount's validity depends on the subtotal it's applied against,
    // and a deposit's validity depends on the TOTAL (the subtotal minus
    // that discount) - so touching items, a discount, or a deposit can
    // each affect whether the others are still valid. Whenever any of
    // the three is changing in this request, whichever of the others
    // ISN'T also in this request body has to come from the database so
    // everything is re-validated against what it will actually apply to
    // once this update lands - not silently left in a state where, say,
    // a shrunk set of items no longer fits an existing fixed discount, or
    // a bigger discount shrinks the total below an existing fixed
    // deposit. When none of the three are changing, nothing here runs
    // and no extra read happens.
    let existingQuote = null;

    if (items !== undefined || discountFieldsProvided || depositFieldsProvided || taxRateProvided) {

      existingQuote = await getQuoteByIdService(id, business_id);

      if (!existingQuote) {

        return res.status(404).json({
          error: "Not found"
        });

      }

      // Once a quote is fully paid, a deposit has actually been collected
      // against its current total/deposit_amount, or ANY manual payment
      // (cash/check/etc., addQuotePayment) has been recorded against it,
      // changing items/discount/deposit would silently invalidate money
      // that's already changed hands - the customer paid based on the
      // numbers as they were, and nothing here reconciles a real payment
      // against a retroactively different total. amount_paid (getQuoteById,
      // quoteService.js) already combines both the deposit and manual-
      // payment cases, so checking it alongside deposit_paid_at also
      // catches a partial cash payment that deposit_paid_at alone would
      // miss entirely. Editing notes/status is still fine; only the
      // fields that affect the actual amounts are blocked.
      if (existingQuote.status === "paid" || existingQuote.deposit_paid_at || existingQuote.amount_paid > 0) {

        return res.status(400).json({
          error: existingQuote.status === "paid"
            ? "This has already been paid in full and can't be edited."
            : "A payment has already been recorded against this - editing the price would no longer match what the customer paid."
        });

      }

      const subtotal = items !== undefined
        ? calculateQuoteTotals(normalizeItems(items), null, null).subtotal
        : existingQuote.subtotal;

      const effectiveDiscountType = discountFieldsProvided ? (discount_type || null) : existingQuote.discount_type;
      const effectiveDiscountValue = discountFieldsProvided
        ? (discount_value === undefined || discount_value === null ? null : discount_value)
        : existingQuote.discount_value;

      const discountError = validateDiscount(effectiveDiscountType, effectiveDiscountValue, subtotal);

      if (discountError) {

        return res.status(400).json({
          error: discountError
        });

      }

      const effectiveTaxRate = taxRateProvided
        ? (tax_rate === null || tax_rate === "" ? null : Number(tax_rate))
        : existingQuote.tax_rate;

      const { total } = applyDiscount(subtotal, effectiveDiscountType, effectiveDiscountValue, effectiveTaxRate);

      const effectiveDepositType = depositFieldsProvided ? (deposit_type || null) : existingQuote.deposit_type;
      const effectiveDepositValue = depositFieldsProvided
        ? (deposit_value === undefined || deposit_value === null ? null : deposit_value)
        : existingQuote.deposit_value;

      const depositError = validateDeposit(effectiveDepositType, effectiveDepositValue, total);

      if (depositError) {

        return res.status(400).json({
          error: depositError
        });

      }

    }

    const fieldsToUpdate = {};

    // "paid" is handled separately below via markQuotePaid, which also
    // sets paid_at and fires the review-request automation - applying it
    // here too would race the two status writes against each other.
    if (status !== undefined && status !== "paid") {

      fieldsToUpdate.status = status;

    }

    if (type !== undefined) {

      fieldsToUpdate.type = type;

    }

    if (notes !== undefined) {

      fieldsToUpdate.notes = notes;

    }

    if (discountFieldsProvided) {

      fieldsToUpdate.discount_type = discount_type || null;
      fieldsToUpdate.discount_value = discount_value === undefined || discount_value === null ? null : Number(discount_value);

    }

    if (depositFieldsProvided) {

      fieldsToUpdate.deposit_type = deposit_type || null;
      fieldsToUpdate.deposit_value = deposit_value === undefined || deposit_value === null ? null : Number(deposit_value);

    }

    if (taxRateProvided) {

      fieldsToUpdate.tax_rate = tax_rate === null || tax_rate === "" ? null : Number(tax_rate);

    }

    if (Object.keys(fieldsToUpdate).length > 0) {

      const updated = await updateQuoteFieldsService(id, business_id, fieldsToUpdate);

      if (!updated) {

        return res.status(404).json({
          error: "Not found"
        });

      }

    }

    if (items !== undefined) {

      const replaced = await replaceQuoteItemsService(id, business_id, normalizeItems(items));

      if (!replaced) {

        return res.status(404).json({
          error: "Not found"
        });

      }

    }

    let reviewRequestSent = false;

    if (status === "paid") {

      const result = await markQuotePaid(id, business_id);

      if (!result.found) {

        return res.status(404).json({
          error: "Not found"
        });

      }

      reviewRequestSent = result.reviewRequestSent;

    }

    res.json({
      message: "Updated",
      review_request_sent: reviewRequestSent
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const deleteQuote = async (req, res) => {

  try {

    const deleted = await deleteQuoteService(req.params.id, req.user.business_id);

    if (!deleted) {

      return res.status(404).json({
        error: "Not found"
      });

    }

    res.json({
      message: "Deleted"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const downloadQuotePdf = async (req, res) => {

  try {

    const quote = await getQuoteByIdService(req.params.id, req.user.business_id);

    if (!quote) {

      return res.status(404).json({
        error: "Not found"
      });

    }

    const business = await getBusinessById(req.user.business_id);

    const numberPart = quote.quote_number ? formatQuoteNumber(quote.type, quote.quote_number) : quote.id.slice(0, 8);
    const filename = `${quote.type}-${numberPart}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    streamQuotePdf(res, quote, business);

  } catch (error) {

    console.error(error);

    // Headers may already be sent once PDF streaming starts, so this
    // only reliably reaches the client for failures before that point.
    if (!res.headersSent) {

      res.status(500).json({
        error: "Something went wrong. Please try again."
      });

    }

  }

};



module.exports = {

  createQuote,

  getQuotes,

  exportQuotesCsv,

  getCustomerQuotes,

  getQuote,

  sendQuote,

  addQuoteExpense,

  deleteQuoteExpense,

  addQuotePayment,

  deleteQuotePayment,

  updateQuote,

  deleteQuote,

  downloadQuotePdf

};
