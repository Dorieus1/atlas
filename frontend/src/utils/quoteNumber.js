// Mirrors formatQuoteNumber in backend/services/quoteService.js. The API
// already sends a pre-formatted `quote_number_formatted` field on every
// quote/invoice response, so this is only a fallback for older cached
// data or partial objects that don't have it yet.
export function formatQuoteNumber(type, quoteNumber) {

  if (quoteNumber === null || quoteNumber === undefined) {
    return null;
  }

  const prefix = type === "invoice" ? "INV" : "Q";

  return `${prefix}-${quoteNumber}`;

}

export function quoteDisplayNumber(quote) {

  if (!quote) {
    return null;
  }

  return quote.quote_number_formatted || formatQuoteNumber(quote.type, quote.quote_number);

}
