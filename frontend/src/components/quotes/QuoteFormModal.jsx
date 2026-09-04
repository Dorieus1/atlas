import { useRef, useState } from "react";
import { Plus, X, Trash2, Sparkles } from "lucide-react";

import { createQuote, updateQuote } from "../../api/atlasApi";
import { formatMoney } from "../../utils/serviceAgreements";
import {
  emptyItem,
  defaultTiers,
  calculatePercentOrFixed,
  calculateTotals,
  cleanItemList
} from "../../utils/quoteHelpers";


// Split out of the old single Quotes.jsx - the create/edit form for a
// quote or invoice, including the optional Good/Better/Best tiers. One
// component handles both create and edit: pass `quote` (the full,
// already-loaded detail - only reachable from QuoteDetailModal's own
// Edit button) to pre-fill for editing, or leave it out for a blank
// create form. `draftItems`/`draftCustomerId`/`draftSummary` pre-fill a
// blank create form instead - the handoff from PhotoGallery's "Draft
// Estimate with AI".
function QuoteFormModal({
  quote,
  customers,
  savedItems,
  businessDefaultTaxRate,
  draftItems,
  draftCustomerId,
  draftSummary,
  onClose,
  onSaved
}) {

  const isEditing = !!quote;
  const initialHasTiers = isEditing && Array.isArray(quote.tiers) && quote.tiers.length > 0;

  const [formCustomerId, setFormCustomerId] = useState(isEditing ? (quote.customer_id || "") : (draftCustomerId || ""));
  const [formNotes, setFormNotes] = useState(isEditing ? (quote.notes || "") : "");
  const [isMultiOption, setIsMultiOption] = useState(initialHasTiers);

  const [formItems, setFormItems] = useState(() => {

    if (isEditing) {

      return (initialHasTiers ? (quote.shared_items || []) : (quote.items || [])).map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price
      }));

    }

    if (draftItems && draftItems.length > 0) {
      return draftItems;
    }

    return [emptyItem()];

  });

  const [formTiers, setFormTiers] = useState(() => {

    if (initialHasTiers) {

      return quote.tiers.map((tier) => ({
        name: tier.name,
        is_recommended: !!tier.is_recommended,
        items: (tier.items.length > 0 ? tier.items : [emptyItem()]).map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price
        }))
      }));

    }

    return defaultTiers();

  });

  const [formDiscountType, setFormDiscountType] = useState(isEditing ? (quote.discount_type || "") : "");
  const [formDiscountValue, setFormDiscountValue] = useState(isEditing && quote.discount_type ? String(quote.discount_value) : "");

  // Pre-filled from the business's own default so the owner doesn't
  // have to remember to type it in on every quote - still just a
  // starting value in the form state, freely editable per quote.
  const [formTaxRate, setFormTaxRate] = useState(() => {

    if (isEditing) {
      return quote.tax_rate === null || quote.tax_rate === undefined ? "" : String(quote.tax_rate);
    }

    return businessDefaultTaxRate === null || businessDefaultTaxRate === undefined ? "" : String(businessDefaultTaxRate);

  });

  const [formDepositType, setFormDepositType] = useState(isEditing ? (quote.deposit_type || "") : "");
  const [formDepositValue, setFormDepositValue] = useState(isEditing && quote.deposit_type ? String(quote.deposit_value) : "");

  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);


  const updateFormItem = (index, field, value) => {

    setFormItems((previous) =>
      previous.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );

  };


  const addFormItem = () => {
    setFormItems((previous) => [...previous, emptyItem()]);
  };


  const removeFormItem = (index) => {

    setFormItems((previous) =>
      previous.length === 1 ? previous : previous.filter((_, i) => i !== index)
    );

  };


  const updateTierField = (tierIndex, field, value) => {

    setFormTiers((previous) =>
      previous.map((tier, i) => (i === tierIndex ? { ...tier, [field]: value } : tier))
    );

  };


  // Only one option can be "recommended" at a time - matches the
  // backend's own single-badge model (see quote_tiers.is_recommended).
  const setRecommendedTier = (tierIndex) => {

    setFormTiers((previous) =>
      previous.map((tier, i) => ({ ...tier, is_recommended: i === tierIndex }))
    );

  };


  const updateTierItem = (tierIndex, itemIndex, field, value) => {

    setFormTiers((previous) =>
      previous.map((tier, i) => (
        i === tierIndex
          ? { ...tier, items: tier.items.map((item, j) => (j === itemIndex ? { ...item, [field]: value } : item)) }
          : tier
      ))
    );

  };


  const addTierItem = (tierIndex) => {

    setFormTiers((previous) =>
      previous.map((tier, i) => (i === tierIndex ? { ...tier, items: [...tier.items, emptyItem()] } : tier))
    );

  };


  const removeTierItem = (tierIndex, itemIndex) => {

    setFormTiers((previous) =>
      previous.map((tier, i) => (
        i === tierIndex
          ? { ...tier, items: tier.items.length === 1 ? tier.items : tier.items.filter((_, j) => j !== itemIndex) }
          : tier
      ))
    );

  };


  const addTier = () => {

    setFormTiers((previous) => {

      if (previous.length >= 5) {
        return previous;
      }

      return [...previous, { name: "", is_recommended: false, items: [emptyItem()] }];

    });

  };


  const removeTier = (tierIndex) => {

    setFormTiers((previous) =>
      previous.length <= 2 ? previous : previous.filter((_, i) => i !== tierIndex)
    );

  };


  const handleQuickAdd = (savedItemId) => {

    const savedItem = savedItems.find((item) => item.id === savedItemId);

    if (!savedItem) {
      return;
    }

    // Quick-add only ever copies the saved item's description/price into a
    // brand-new line item - quantity defaults to 1, and the result is a
    // normal, independent line item the user can still edit or remove like
    // any manually-typed one. Nothing here links back to the saved item,
    // so later editing/deleting the saved template can't affect this quote.
    const newItem = {
      description: savedItem.description,
      quantity: 1,
      unit_price: savedItem.unit_price
    };

    setFormItems((previous) => {

      // A fresh, still-blank form starts with one empty placeholder row -
      // quick-adding into that state should fill it in rather than leave
      // an empty row dangling above the picked service.
      if (previous.length === 1 && !previous[0].description.trim() && Number(previous[0].unit_price) === 0) {
        return [newItem];
      }

      return [...previous, newItem];

    });

  };


  const formTotals = calculateTotals(formItems, formDiscountType, formDiscountValue, formTaxRate, formDepositType, formDepositValue);


  const handleSaveQuote = async () => {

    if (!formCustomerId) {
      setFormError("Choose a customer.");
      return;
    }

    const cleanItems = cleanItemList(formItems);

    let cleanTiers = null;

    if (isMultiOption) {

      cleanTiers = formTiers.map((tier) => ({
        name: tier.name.trim(),
        is_recommended: !!tier.is_recommended,
        items: cleanItemList(tier.items)
      }));

      if (cleanTiers.length < 2) {
        setFormError("At least 2 options are needed for a multi-option quote.");
        return;
      }

      if (cleanTiers.some((tier) => !tier.name)) {
        setFormError("Every option needs a name.");
        return;
      }

      const lowerNames = cleanTiers.map((tier) => tier.name.toLowerCase());

      if (new Set(lowerNames).size !== lowerNames.length) {
        setFormError("Each option needs a unique name.");
        return;
      }

      if (cleanTiers.some((tier) => tier.items.length === 0 && cleanItems.length === 0)) {
        setFormError("Every option needs at least one line item.");
        return;
      }

      if (cleanTiers.some((tier) => tier.items.some((item) => !(item.quantity > 0) || !(item.unit_price >= 0)))) {
        setFormError("Every line item needs a positive quantity and a valid price.");
        return;
      }

    } else if (cleanItems.length === 0) {

      setFormError("Add at least one line item with a description.");
      return;

    }

    if (cleanItems.some((item) => !(item.quantity > 0) || !(item.unit_price >= 0))) {
      setFormError("Every line item needs a positive quantity and a valid price.");
      return;
    }

    // For a multi-option quote, a fixed discount/deposit has to make
    // sense for every option, not just one - so it's checked against the
    // CHEAPEST option (shared items + that option's own items), the same
    // conservative bound quoteController.js's own validation uses. If
    // it's safe there, it's safe for every pricier option too.
    const cleanSubtotal = isMultiOption
      ? Math.min(...cleanTiers.map((tier) =>
          [...cleanItems, ...tier.items].reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
        ))
      : cleanItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

    if (formDiscountType) {

      const value = Number(formDiscountValue);

      if (!Number.isFinite(value) || value < 0) {
        setFormError("Enter a valid discount amount.");
        return;
      }

      if (formDiscountType === "percent" && value > 100) {
        setFormError("A percent discount can't be more than 100%.");
        return;
      }

      if (formDiscountType === "fixed" && value > cleanSubtotal) {
        setFormError("The discount can't be more than the subtotal.");
        return;
      }

    }

    if (formTaxRate !== "" && formTaxRate !== null && formTaxRate !== undefined) {

      const value = Number(formTaxRate);

      if (!Number.isFinite(value) || value < 0 || value > 100) {
        setFormError("Enter a valid tax rate between 0 and 100.");
        return;
      }

    }

    if (formDepositType) {

      const value = Number(formDepositValue);

      if (!Number.isFinite(value) || value < 0) {
        setFormError("Enter a valid deposit amount.");
        return;
      }

      if (formDepositType === "percent" && value > 100) {
        setFormError("A percent deposit can't be more than 100%.");
        return;
      }

      // Checked against the TOTAL (after any discount and tax), not the
      // raw subtotal - a deposit is up-front money toward what the
      // customer will actually owe. Mirrors calculateTotals() above.
      const cleanDiscountAmount = calculatePercentOrFixed(cleanSubtotal, formDiscountType, formDiscountValue);
      const cleanTaxableAmount = cleanSubtotal - cleanDiscountAmount;
      const cleanTaxRate = Number(formTaxRate);
      const cleanTaxAmount = Number.isFinite(cleanTaxRate) && cleanTaxRate > 0 ? cleanTaxableAmount * (cleanTaxRate / 100) : 0;
      const cleanTotal = cleanTaxableAmount + cleanTaxAmount;

      if (formDepositType === "fixed" && value > cleanTotal) {
        setFormError("The deposit can't be more than the total.");
        return;
      }

    }

    if (savingRef.current) {
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setFormError("");

    try {

      if (isEditing) {

        await updateQuote(quote.id, {
          notes: formNotes.trim() || null,
          items: cleanItems,
          ...(isMultiOption ? { tiers: cleanTiers } : {}),
          discount_type: formDiscountType || null,
          discount_value: formDiscountType ? Number(formDiscountValue) : null,
          tax_rate: formTaxRate === "" ? null : Number(formTaxRate),
          deposit_type: formDepositType || null,
          deposit_value: formDepositType ? Number(formDepositValue) : null
        });

      } else {

        await createQuote(
          formCustomerId,
          "quote",
          formNotes.trim() || null,
          cleanItems,
          formDiscountType || null,
          formDiscountType ? Number(formDiscountValue) : null,
          formDepositType || null,
          formDepositType ? Number(formDepositValue) : null,
          formTaxRate === "" ? null : Number(formTaxRate),
          isMultiOption ? cleanTiers : undefined
        );

      }

      onSaved();

    } catch (error) {

      console.error("SAVE QUOTE ERROR:", error);
      setFormError(error.message || "Couldn't save that quote. Please try again.");

    } finally {

      savingRef.current = false;
      setSaving(false);

    }

  };


  return (

    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >

      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >

        <div className="flex items-center justify-between">

          <h3 className="font-display text-lg font-bold">
            {isEditing ? "Edit Quote" : draftSummary ? "AI-Drafted Quote" : "New Quote"}
          </h3>

          <button
            onClick={onClose}
            className="rounded-lg p-1 text-fg-muted hover:bg-surface-muted hover:text-fg"
            aria-label="Close"
          >
            <X size={18} />
          </button>

        </div>

        {draftSummary && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-brand-600/10 p-3 text-sm text-brand-300">
            <Sparkles size={15} className="mt-0.5 shrink-0" />
            <p>{draftSummary} Review the line items below before saving — this is a starting point, not a final price.</p>
          </div>
        )}

        {formError && (
          <p className="mt-3 text-sm text-danger">
            {formError}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-3">

          <select
            value={formCustomerId}
            onChange={(e) => setFormCustomerId(e.target.value)}
            disabled={isEditing}
            title={isEditing ? "The customer on a quote can't be changed after it's created" : undefined}
            className="w-full rounded-lg border border-border bg-surface-muted p-3 text-fg focus:border-border-strong focus:outline-none disabled:opacity-60"
          >
            <option value="">Choose a customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {savedItems.length > 0 && (

            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  handleQuickAdd(e.target.value);
                }
              }}
              className="w-full rounded-lg border border-border bg-surface-muted p-2.5 text-sm text-fg-muted focus:border-border-strong focus:outline-none"
            >
              <option value="">⚡ Quick add a saved service...</option>
              {savedItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.description} — {formatMoney(item.unit_price)}
                </option>
              ))}
            </select>

          )}

          <div className="flex flex-col gap-2">

            <div className="flex items-center gap-2 px-0.5 text-xs font-medium uppercase tracking-wide text-fg-faint">
              <span className="min-w-0 flex-1">
                {isMultiOption ? "Shared items (optional)" : "Description"}
              </span>
              {!isMultiOption && (
                <>
                  <span className="w-16">Qty</span>
                  <span className="w-24">Price</span>
                  <span className="w-[27px] shrink-0" aria-hidden="true" />
                </>
              )}
            </div>

            {formItems.map((item, index) => (

              <div key={index} className="flex items-center gap-2">

                <input
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => updateFormItem(index, "description", e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-surface-muted p-2.5 text-sm text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
                />

                <input
                  type="number"
                  min="0"
                  placeholder="Qty"
                  value={item.quantity}
                  onChange={(e) => updateFormItem(index, "quantity", e.target.value)}
                  className="w-16 rounded-lg border border-border bg-surface-muted p-2.5 text-sm text-fg focus:border-border-strong focus:outline-none"
                />

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Price"
                  value={item.unit_price}
                  onChange={(e) => updateFormItem(index, "unit_price", e.target.value)}
                  className="w-24 rounded-lg border border-border bg-surface-muted p-2.5 text-sm text-fg focus:border-border-strong focus:outline-none"
                />

                <button
                  onClick={() => removeFormItem(index)}
                  className="shrink-0 rounded-lg p-2 text-fg-faint transition hover:bg-danger/10 hover:text-danger"
                  aria-label="Remove line item"
                >
                  <Trash2 size={15} />
                </button>

              </div>

            ))}

            <button
              onClick={addFormItem}
              className="flex items-center gap-1.5 self-start rounded-lg px-2 py-1.5 text-sm font-medium text-brand-400 transition hover:bg-brand-600/10"
            >
              <Plus size={15} />
              {isMultiOption ? "Add shared item" : "Add line item"}
            </button>

          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-sm">

            <input
              type="checkbox"
              checked={isMultiOption}
              onChange={(e) => setIsMultiOption(e.target.checked)}
              className="h-4 w-4 accent-brand-600"
            />

            <span className="font-medium">Give the customer options</span>
            <span className="text-fg-faint">— Good / Better / Best pricing tiers</span>

          </label>

          {isMultiOption && (

            <div className="flex flex-col gap-3">

              {formTiers.map((tier, tierIndex) => (

                <div key={tierIndex} className="rounded-lg border border-border p-3">

                  <div className="flex items-center gap-2">

                    <input
                      placeholder="Option name (e.g. Good)"
                      value={tier.name}
                      onChange={(e) => updateTierField(tierIndex, "name", e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-surface-muted p-2.5 text-sm font-semibold text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
                    />

                    <label className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-fg-muted">
                      <input
                        type="radio"
                        name="recommended-tier"
                        checked={tier.is_recommended}
                        onChange={() => setRecommendedTier(tierIndex)}
                        className="h-3.5 w-3.5 accent-brand-600"
                      />
                      Recommended
                    </label>

                    {formTiers.length > 2 && (
                      <button
                        onClick={() => removeTier(tierIndex)}
                        className="shrink-0 rounded-lg p-2 text-fg-faint transition hover:bg-danger/10 hover:text-danger"
                        aria-label={`Remove ${tier.name || "this"} option`}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}

                  </div>

                  <div className="mt-2 flex flex-col gap-2">

                    {tier.items.map((item, itemIndex) => (

                      <div key={itemIndex} className="flex items-center gap-2">

                        <input
                          placeholder="Description"
                          value={item.description}
                          onChange={(e) => updateTierItem(tierIndex, itemIndex, "description", e.target.value)}
                          className="min-w-0 flex-1 rounded-lg border border-border bg-surface-muted p-2 text-sm text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
                        />

                        <input
                          type="number"
                          min="0"
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={(e) => updateTierItem(tierIndex, itemIndex, "quantity", e.target.value)}
                          className="w-14 rounded-lg border border-border bg-surface-muted p-2 text-sm text-fg focus:border-border-strong focus:outline-none"
                        />

                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Price"
                          value={item.unit_price}
                          onChange={(e) => updateTierItem(tierIndex, itemIndex, "unit_price", e.target.value)}
                          className="w-20 rounded-lg border border-border bg-surface-muted p-2 text-sm text-fg focus:border-border-strong focus:outline-none"
                        />

                        <button
                          onClick={() => removeTierItem(tierIndex, itemIndex)}
                          className="shrink-0 rounded-lg p-1.5 text-fg-faint transition hover:bg-danger/10 hover:text-danger"
                          aria-label="Remove line item"
                        >
                          <Trash2 size={13} />
                        </button>

                      </div>

                    ))}

                    <button
                      onClick={() => addTierItem(tierIndex)}
                      className="flex items-center gap-1.5 self-start rounded-lg px-2 py-1 text-xs font-medium text-brand-400 transition hover:bg-brand-600/10"
                    >
                      <Plus size={13} />
                      Add item
                    </button>

                  </div>

                </div>

              ))}

              {formTiers.length < 5 && (

                <button
                  onClick={addTier}
                  className="flex items-center gap-1.5 self-start rounded-lg px-2 py-1.5 text-sm font-medium text-brand-400 transition hover:bg-brand-600/10"
                >
                  <Plus size={15} />
                  Add another option
                </button>

              )}

            </div>

          )}

          <textarea
            placeholder="Notes (optional)"
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            className="h-16 w-full rounded-lg border border-border bg-surface-muted p-3 text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
          />

          <div className="flex items-center gap-2">

            <select
              value={formDiscountType}
              onChange={(e) => {
                setFormDiscountType(e.target.value);
                if (!e.target.value) setFormDiscountValue("");
              }}
              className="rounded-lg border border-border bg-surface-muted p-2.5 text-sm text-fg focus:border-border-strong focus:outline-none"
            >
              <option value="">No discount</option>
              <option value="percent">% off</option>
              <option value="fixed">$ off</option>
            </select>

            {formDiscountType && (
              <input
                type="number"
                min="0"
                max={formDiscountType === "percent" ? 100 : undefined}
                step="0.01"
                placeholder={formDiscountType === "percent" ? "e.g. 15" : "e.g. 20.00"}
                value={formDiscountValue}
                onChange={(e) => setFormDiscountValue(e.target.value)}
                className="w-28 rounded-lg border border-border bg-surface-muted p-2.5 text-sm text-fg focus:border-border-strong focus:outline-none"
              />
            )}

          </div>

          <div className="flex items-center gap-2">

            <label className="text-sm text-fg-muted">
              Tax rate
            </label>

            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              placeholder="e.g. 8.5"
              value={formTaxRate}
              onChange={(e) => setFormTaxRate(e.target.value)}
              className="w-28 rounded-lg border border-border bg-surface-muted p-2.5 text-sm text-fg focus:border-border-strong focus:outline-none"
            />

            <span className="text-sm text-fg-faint">%</span>

          </div>

          <div className="flex items-center gap-2">

            <select
              value={formDepositType}
              onChange={(e) => {
                setFormDepositType(e.target.value);
                if (!e.target.value) setFormDepositValue("");
              }}
              className="rounded-lg border border-border bg-surface-muted p-2.5 text-sm text-fg focus:border-border-strong focus:outline-none"
            >
              <option value="">No deposit</option>
              <option value="percent">% deposit</option>
              <option value="fixed">$ deposit</option>
            </select>

            {formDepositType && (
              <input
                type="number"
                min="0"
                max={formDepositType === "percent" ? 100 : undefined}
                step="0.01"
                placeholder={formDepositType === "percent" ? "e.g. 25" : "e.g. 100.00"}
                value={formDepositValue}
                onChange={(e) => setFormDepositValue(e.target.value)}
                className="w-28 rounded-lg border border-border bg-surface-muted p-2.5 text-sm text-fg focus:border-border-strong focus:outline-none"
              />
            )}

          </div>

          {isMultiOption ? (

            // No single subtotal makes sense for a not-yet-decided
            // multi-option quote - each option gets its own final
            // total instead (shared items + that option's own,
            // discount/tax already folded in), same as the backend's
            // own per-tier breakdown.
            <div className="flex flex-col gap-1 rounded-lg bg-surface-muted px-4 py-3">

              {formTiers.map((tier, tierIndex) => {

                const tierTotals = calculateTotals(
                  [...formItems, ...tier.items],
                  formDiscountType,
                  formDiscountValue,
                  formTaxRate,
                  formDepositType,
                  formDepositValue
                );

                return (

                  <div key={tierIndex} className="flex items-center justify-between">
                    <span className="text-sm text-fg-muted">
                      {tier.name || `Option ${tierIndex + 1}`}
                      {tier.is_recommended ? " ⭐" : ""}
                    </span>
                    <span className="font-display text-lg font-bold">
                      {formatMoney(tierTotals.total)}
                    </span>
                  </div>

                );

              })}

            </div>

          ) : (

            <div className="flex flex-col gap-1 rounded-lg bg-surface-muted px-4 py-3">

              {(formDiscountType || formTotals.tax_amount > 0) && (

                <div className="flex items-center justify-between text-sm text-fg-muted">
                  <span>Subtotal</span>
                  <span>{formatMoney(formTotals.subtotal)}</span>
                </div>

              )}

              {formDiscountType && (

                <div className="flex items-center justify-between text-sm text-fg-muted">
                  <span>
                    Discount
                    {formDiscountType === "percent" && formDiscountValue ? ` (${formDiscountValue}%)` : ""}
                  </span>
                  <span>-{formatMoney(formTotals.discount_amount)}</span>
                </div>

              )}

              {formTotals.tax_amount > 0 && (

                <div className="flex items-center justify-between text-sm text-fg-muted">
                  <span>
                    Tax
                    {formTaxRate ? ` (${formTaxRate}%)` : ""}
                  </span>
                  <span>{formatMoney(formTotals.tax_amount)}</span>
                </div>

              )}

              <div className="flex items-center justify-between">
                <span className="text-sm text-fg-muted">Total</span>
                <span className="font-display text-xl font-bold">
                  {formatMoney(formTotals.total)}
                </span>
              </div>

              {formDepositType && (
                <div className="flex items-center justify-between text-sm text-fg-muted">
                  <span>
                    Deposit due on approval
                    {formDepositType === "percent" && formDepositValue ? ` (${formDepositValue}%)` : ""}
                  </span>
                  <span>{formatMoney(formTotals.deposit_amount)}</span>
                </div>
              )}

            </div>

          )}

          <button
            onClick={handleSaveQuote}
            disabled={saving}
            className="mt-1 rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
          >
            {saving
              ? (isEditing ? "Saving..." : "Creating...")
              : (isEditing ? "Save Changes" : "Create Quote")}
          </button>

        </div>

      </div>

    </div>

  );

}

export default QuoteFormModal;
