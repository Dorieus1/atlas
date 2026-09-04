// Shared by Quotes.jsx and the components under components/quotes/ - all
// of this used to live inline in one 2,400-line Quotes.jsx. Splitting it
// out here means the form/detail/sign-on-site modals (and the page
// itself) all compute totals, validate discount/tax/deposit values, and
// style a status badge exactly the same way, from one place, instead of
// each having to stay in sync with copies of the same logic.

export const STATUS_STYLES = {
  draft: "bg-slate-500/20 text-fg-muted",
  sent: "bg-accent-text/20 text-accent-text",
  accepted: "bg-success/20 text-success",
  declined: "bg-danger/20 text-danger",
  paid: "bg-success/20 text-success"
};

export const STATUS_OPTIONS = ["draft", "sent", "accepted", "declined", "paid"];

export const PAYMENT_METHOD_LABELS = {
  cash: "Cash",
  check: "Check",
  bank_transfer: "Bank transfer",
  other: "Other"
};

// Matches invoiceReminderService's own "first reminder 3 days after
// sent_at" cadence on the backend, so an invoice only gets flagged here
// exactly when the owner's first real reminder email is also going out
// - not a separate, disconnected definition of "overdue".
export const OVERDUE_AFTER_DAYS = 3;

export function isOverdueInvoice(quote) {

  return (
    quote.type === "invoice" &&
    quote.status === "sent" &&
    quote.sent_at &&
    Date.now() - new Date(quote.sent_at).getTime() > OVERDUE_AFTER_DAYS * 24 * 60 * 60 * 1000
  );

}

export const emptyItem = () => ({ description: "", quantity: 1, unit_price: 0 });

// The classic 3-option starting point for a "Good/Better/Best" quote -
// still just a starting point, every name/item/recommendation is freely
// editable before saving, and a tier can be added or removed too.
export const defaultTiers = () => ([
  { name: "Good", is_recommended: false, items: [emptyItem()] },
  { name: "Better", is_recommended: true, items: [emptyItem()] },
  { name: "Best", is_recommended: false, items: [emptyItem()] }
]);

// Mirrors the backend's percent-or-fixed arithmetic (backend/services/
// quoteService.js's calculatePercentOrFixed(), shared by applyDiscount()
// and calculateDeposit()) so the form can show a live preview as the user
// types - the actual, authoritative numbers still come back from the
// server on save/reload, this is just for preview.
export function calculatePercentOrFixed(base, type, value) {

  const numericValue = Number(value);

  if (type === "percent" && Number.isFinite(numericValue)) {
    return base * (numericValue / 100);
  }

  if (type === "fixed" && Number.isFinite(numericValue)) {
    return numericValue;
  }

  return 0;

}

// Mirrors the backend's calculateQuoteTotals() (backend/services/
// quoteService.js) so the form can show a live Subtotal/Discount/Tax/
// Deposit/Total breakdown as the user types. Tax is computed on the
// discounted amount, not the raw subtotal - same order the backend
// applies it in.
export function calculateTotals(items, discountType, discountValue, taxRate, depositType, depositValue) {

  const subtotal = items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0),
    0
  );

  const discount_amount = calculatePercentOrFixed(subtotal, discountType, discountValue);
  const taxable_amount = subtotal - discount_amount;
  const numericTaxRate = Number(taxRate);
  const tax_amount = Number.isFinite(numericTaxRate) && numericTaxRate > 0 ? taxable_amount * (numericTaxRate / 100) : 0;
  const total = taxable_amount + tax_amount;
  const deposit_amount = calculatePercentOrFixed(total, depositType, depositValue);

  return { subtotal, discount_amount, tax_amount, total, deposit_amount };

}

// Strips a line-item array down to what the API expects: trimmed
// description, numeric quantity/price, and drops any row the user left
// completely blank (the form always keeps at least one empty row
// visible to type into, which isn't itself a real line item).
export function cleanItemList(items) {

  return items
    .map((item) => ({
      description: item.description.trim(),
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price)
    }))
    .filter((item) => item.description);

}
