const {
  createQuote: createQuoteService,
  getQuotes: getQuotesService,
  getQuotesByCustomer: getQuotesByCustomerService,
  getQuoteById: getQuoteByIdService,
  updateQuoteFields: updateQuoteFieldsService,
  replaceQuoteItems: replaceQuoteItemsService,
  deleteQuote: deleteQuoteService
} = require("../services/quoteService");

const { getCustomerById } = require("../services/customerService");
const { getBusinessById } = require("../services/businessService");
const { sendReviewRequestForCustomer } = require("../services/reviewRequestService");


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



const createQuote = async (req, res) => {

  try {

    const {
      customer_id,
      type,
      notes,
      items
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

    const customer = await getCustomerById(customer_id, business_id);

    if (!customer) {

      return res.status(404).json({
        error: "Customer not found"
      });

    }

    const id = await createQuoteService(
      business_id,
      customer_id,
      quoteType,
      notes,
      normalizeItems(items)
    );

    res.status(201).json({
      id,
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

    res.json(quotes);

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

    res.json(quotes);

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

    res.json(quote);

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
    const { status, notes, type, items } = req.body;

    const fieldsToUpdate = {};

    if (status !== undefined) {

      if (!VALID_STATUSES.includes(status)) {

        return res.status(400).json({
          error: "status must be one of: " + VALID_STATUSES.join(", ")
        });

      }

      fieldsToUpdate.status = status;

    }

    if (type !== undefined) {

      if (!VALID_TYPES.includes(type)) {

        return res.status(400).json({
          error: "type must be one of: " + VALID_TYPES.join(", ")
        });

      }

      fieldsToUpdate.type = type;

    }

    if (notes !== undefined) {

      fieldsToUpdate.notes = notes;

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

      const itemsError = validateItems(items);

      if (itemsError) {

        return res.status(400).json({
          error: itemsError
        });

      }

      const replaced = await replaceQuoteItemsService(id, business_id, normalizeItems(items));

      if (!replaced) {

        return res.status(404).json({
          error: "Not found"
        });

      }

    }

    let reviewRequestSent = false;

    // Best-effort automation: an invoice being marked paid is the exact
    // moment a business would want to ask for a review, so do it
    // automatically instead of relying on someone remembering to click
    // "Request Review" separately. Silently does nothing if the customer
    // has no email or the business hasn't set a review link yet - both
    // are normal, expected states, not failures - and a real send
    // failure must never make the "mark as paid" update itself look like
    // it failed.
    if (status === "paid") {

      try {

        const quote = await getQuoteByIdService(id, business_id);

        if (quote && quote.type === "invoice") {

          const customer = await getCustomerById(quote.customer_id, business_id);
          const business = await getBusinessById(business_id);

          if (customer && business) {

            const result = await sendReviewRequestForCustomer(business, customer);

            reviewRequestSent = result.sent;

          }

        }

      } catch (reviewError) {

        console.error("AUTO REVIEW REQUEST FAILED:", reviewError);

      }

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



module.exports = {

  createQuote,

  getQuotes,

  getCustomerQuotes,

  getQuote,

  updateQuote,

  deleteQuote

};
