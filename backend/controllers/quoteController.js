const {
  createQuote: createQuoteService,
  calculateQuoteTotals,
  formatQuoteNumber,
  getQuotes: getQuotesService,
  getQuotesForExport: getQuotesForExportService,
  getQuoteItemsForQuoteIds: getQuoteItemsForQuoteIdsService,
  getQuotesByCustomer: getQuotesByCustomerService,
  getQuoteById: getQuoteByIdService,
  updateQuoteFields: updateQuoteFieldsService,
  replaceQuoteItems: replaceQuoteItemsService,
  deleteQuote: deleteQuoteService
} = require("../services/quoteService");

const { getCustomerById } = require("../services/customerService");
const { getBusinessById } = require("../services/businessService");
const { getUserById } = require("../services/authService");
const { markQuotePaid } = require("../services/quotePaymentService");
const { streamQuotePdf } = require("../services/pdfService");
const { quotesToCsv } = require("../services/csvService");


const VALID_TYPES = ["quote", "invoice"];
const VALID_STATUSES = ["draft", "sent", "accepted", "declined", "paid"];


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
      discount_value
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

    const customer = await getCustomerById(customer_id, business_id);

    if (!customer) {

      return res.status(404).json({
        error: "Customer not found"
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
      discount_value === undefined ? null : discount_value
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

    const items = await getQuoteItemsForQuoteIdsService(quotes.map((quote) => quote.id));

    const itemsByQuoteId = {};

    for (const item of items) {

      if (!itemsByQuoteId[item.quote_id]) {
        itemsByQuoteId[item.quote_id] = [];
      }

      itemsByQuoteId[item.quote_id].push(item);

    }

    const csv = quotesToCsv(quotes, itemsByQuoteId);

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



const updateQuote = async (req, res) => {

  try {

    const { id } = req.params;
    const business_id = req.user.business_id;
    const { status, notes, type, items, discount_type, discount_value } = req.body;

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

    // Whether discount_type/discount_value are being changed in this
    // request at all - if neither is present, the stored discount (if
    // any) is left exactly as-is.
    const discountFieldsProvided = discount_type !== undefined || discount_value !== undefined;

    // A discount's validity depends on the subtotal it's applied against,
    // and a subtotal depends on which line items are in play. Whenever
    // exactly one of {items, discount} is changing in this request, the
    // OTHER one's current value has to come from the database so the
    // discount is re-validated against the subtotal it will actually
    // apply to once this update lands - not silently left in a state
    // where a fixed discount now exceeds a shrunk set of items, or a
    // brand-new discount is checked against stale items. When both (or
    // neither) are changing together, everything needed is already in
    // this request body and no extra read is needed.
    let existingQuote = null;

    if ((items !== undefined) !== discountFieldsProvided) {

      existingQuote = await getQuoteByIdService(id, business_id);

      if (!existingQuote) {

        return res.status(404).json({
          error: "Not found"
        });

      }

    }

    if (items !== undefined || discountFieldsProvided) {

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

  updateQuote,

  deleteQuote,

  downloadQuotePdf

};
